-- Migration 006: Mind Maps System
-- Adds interactive mind map functionality for visual concept mapping

-- Update study_materials type to include 'mind_map'
ALTER TABLE study_materials
  DROP CONSTRAINT IF EXISTS study_materials_type_check;

ALTER TABLE study_materials
  ADD CONSTRAINT study_materials_type_check
  CHECK (type IN ('quiz', 'flashcard_set', 'summary', 'mind_map'));

-- Mind maps metadata table
-- Note: root_node_id foreign key constraint is added later after mind_map_nodes table exists
CREATE TABLE IF NOT EXISTS mind_maps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_material_id UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  root_node_id UUID, -- FK constraint added below after mind_map_nodes table creation
  layout_algorithm TEXT DEFAULT 'dagre' CHECK (layout_algorithm IN ('dagre', 'elk', 'manual')),
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mind map nodes table (concepts)
-- Note: mind_map_id should not be updated once set (nodes don't move between mind maps)
-- This is enforced at the application layer; RLS policies assume this invariant
CREATE TABLE IF NOT EXISTS mind_map_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mind_map_id UUID NOT NULL REFERENCES mind_maps(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT,
  node_type TEXT DEFAULT 'concept' CHECK (node_type IN ('concept', 'topic', 'subtopic', 'detail')),
  level INTEGER NOT NULL DEFAULT 0 CHECK (level >= 0 AND level <= 3),
  position_x DECIMAL(10,2),
  position_y DECIMAL(10,2),
  width DECIMAL(10,2) DEFAULT 200,
  height DECIMAL(10,2) DEFAULT 100,
  style JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mind map edges table (relationships)
-- Note: mind_map_id should not be updated once set (edges don't move between mind maps)
-- This is enforced at the application layer; RLS policies assume this invariant
CREATE TABLE IF NOT EXISTS mind_map_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mind_map_id UUID NOT NULL REFERENCES mind_maps(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,
  label TEXT,
  edge_type TEXT DEFAULT 'child' CHECK (edge_type IN ('child', 'related', 'prerequisite', 'example')),
  style JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_node_id, target_node_id, edge_type)
);

-- Mind map user interactions table (for analytics)
CREATE TABLE IF NOT EXISTS mind_map_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mind_map_id UUID NOT NULL REFERENCES mind_maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id UUID REFERENCES mind_map_nodes(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('view', 'expand', 'collapse', 'ask_question')),
  interaction_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint for root_node_id now that mind_map_nodes exists
-- If root node is deleted, set root_node_id to NULL to maintain referential integrity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mind_maps_root_node_fk'
  ) THEN
    ALTER TABLE mind_maps
      ADD CONSTRAINT mind_maps_root_node_fk
      FOREIGN KEY (root_node_id)
      REFERENCES mind_map_nodes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mind_maps_study_material ON mind_maps(study_material_id);
CREATE INDEX IF NOT EXISTS idx_mind_map_nodes_map ON mind_map_nodes(mind_map_id);
CREATE INDEX IF NOT EXISTS idx_mind_map_nodes_level ON mind_map_nodes(mind_map_id, level);
CREATE INDEX IF NOT EXISTS idx_mind_map_edges_map ON mind_map_edges(mind_map_id);
CREATE INDEX IF NOT EXISTS idx_mind_map_edges_source ON mind_map_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_mind_map_edges_target ON mind_map_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_mind_map_interactions_map_user ON mind_map_interactions(mind_map_id, user_id);

-- Trigger function to update node_count (handles both INSERT and DELETE)
CREATE OR REPLACE FUNCTION update_mind_map_node_count()
RETURNS TRIGGER AS $$
DECLARE
  _map_id UUID;
BEGIN
  -- Use NEW.mind_map_id for INSERT, OLD.mind_map_id for DELETE
  _map_id := COALESCE(NEW.mind_map_id, OLD.mind_map_id);

  UPDATE mind_maps
  SET node_count = (
    SELECT COUNT(*) FROM mind_map_nodes WHERE mind_map_id = _map_id
  ),
  updated_at = NOW()
  WHERE id = _map_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update edge_count (handles both INSERT and DELETE)
CREATE OR REPLACE FUNCTION update_mind_map_edge_count()
RETURNS TRIGGER AS $$
DECLARE
  _map_id UUID;
BEGIN
  -- Use NEW.mind_map_id for INSERT, OLD.mind_map_id for DELETE
  _map_id := COALESCE(NEW.mind_map_id, OLD.mind_map_id);

  UPDATE mind_maps
  SET edge_count = (
    SELECT COUNT(*) FROM mind_map_edges WHERE mind_map_id = _map_id
  ),
  updated_at = NOW()
  WHERE id = _map_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic count updates
DROP TRIGGER IF EXISTS trigger_update_node_count ON mind_map_nodes;
CREATE TRIGGER trigger_update_node_count
AFTER INSERT OR DELETE ON mind_map_nodes
FOR EACH ROW
EXECUTE FUNCTION update_mind_map_node_count();

DROP TRIGGER IF EXISTS trigger_update_edge_count ON mind_map_edges;
CREATE TRIGGER trigger_update_edge_count
AFTER INSERT OR DELETE ON mind_map_edges
FOR EACH ROW
EXECUTE FUNCTION update_mind_map_edge_count();

-- Enable Row Level Security
ALTER TABLE mind_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE mind_map_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mind_map_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE mind_map_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mind_maps
DROP POLICY IF EXISTS "Users can view their own mind maps" ON mind_maps;
CREATE POLICY "Users can view their own mind maps"
  ON mind_maps FOR SELECT
  USING (
    study_material_id IN (
      SELECT id FROM study_materials WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own mind maps" ON mind_maps;
CREATE POLICY "Users can insert their own mind maps"
  ON mind_maps FOR INSERT
  WITH CHECK (
    study_material_id IN (
      SELECT id FROM study_materials WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own mind maps" ON mind_maps;
CREATE POLICY "Users can update their own mind maps"
  ON mind_maps FOR UPDATE
  USING (
    study_material_id IN (
      SELECT id FROM study_materials WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    study_material_id IN (
      SELECT id FROM study_materials WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own mind maps" ON mind_maps;
CREATE POLICY "Users can delete their own mind maps"
  ON mind_maps FOR DELETE
  USING (
    study_material_id IN (
      SELECT id FROM study_materials WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for mind_map_nodes
-- Note: These policies assume mind_map_id is not changed via UPDATE
DROP POLICY IF EXISTS "Users can view nodes from their own mind maps" ON mind_map_nodes;
CREATE POLICY "Users can view nodes from their own mind maps"
  ON mind_map_nodes FOR SELECT
  USING (
    mind_map_id IN (
      SELECT id FROM mind_maps WHERE study_material_id IN (
        SELECT id FROM study_materials WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert nodes to their own mind maps" ON mind_map_nodes;
CREATE POLICY "Users can insert nodes to their own mind maps"
  ON mind_map_nodes FOR INSERT
  WITH CHECK (
    mind_map_id IN (
      SELECT id FROM mind_maps WHERE study_material_id IN (
        SELECT id FROM study_materials WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update nodes in their own mind maps" ON mind_map_nodes;
CREATE POLICY "Users can update nodes in their own mind maps"
  ON mind_map_nodes FOR UPDATE
  USING (
    mind_map_id IN (
      SELECT id FROM mind_maps WHERE study_material_id IN (
        SELECT id FROM study_materials WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete nodes from their own mind maps" ON mind_map_nodes;
CREATE POLICY "Users can delete nodes from their own mind maps"
  ON mind_map_nodes FOR DELETE
  USING (
    mind_map_id IN (
      SELECT id FROM mind_maps WHERE study_material_id IN (
        SELECT id FROM study_materials WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for mind_map_edges
-- Note: These policies assume mind_map_id is not changed via UPDATE
DROP POLICY IF EXISTS "Users can view edges from their own mind maps" ON mind_map_edges;
CREATE POLICY "Users can view edges from their own mind maps"
  ON mind_map_edges FOR SELECT
  USING (
    mind_map_id IN (
      SELECT id FROM mind_maps WHERE study_material_id IN (
        SELECT id FROM study_materials WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert edges to their own mind maps" ON mind_map_edges;
CREATE POLICY "Users can insert edges to their own mind maps"
  ON mind_map_edges FOR INSERT
  WITH CHECK (
    mind_map_id IN (
      SELECT id FROM mind_maps WHERE study_material_id IN (
        SELECT id FROM study_materials WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update edges in their own mind maps" ON mind_map_edges;
CREATE POLICY "Users can update edges in their own mind maps"
  ON mind_map_edges FOR UPDATE
  USING (
    mind_map_id IN (
      SELECT id FROM mind_maps WHERE study_material_id IN (
        SELECT id FROM study_materials WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete edges from their own mind maps" ON mind_map_edges;
CREATE POLICY "Users can delete edges from their own mind maps"
  ON mind_map_edges FOR DELETE
  USING (
    mind_map_id IN (
      SELECT id FROM mind_maps WHERE study_material_id IN (
        SELECT id FROM study_materials WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for mind_map_interactions
DROP POLICY IF EXISTS "Users can view their own interactions" ON mind_map_interactions;
CREATE POLICY "Users can view their own interactions"
  ON mind_map_interactions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own interactions" ON mind_map_interactions;
CREATE POLICY "Users can insert their own interactions"
  ON mind_map_interactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    mind_map_id IN (
      SELECT id FROM mind_maps WHERE study_material_id IN (
        SELECT id FROM study_materials WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update their own interactions" ON mind_map_interactions;
CREATE POLICY "Users can update their own interactions"
  ON mind_map_interactions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid() AND
    mind_map_id IN (
      SELECT id FROM mind_maps WHERE study_material_id IN (
        SELECT id FROM study_materials WHERE user_id = auth.uid()
      )
    )
  ); -- Prevent changing user_id to another user or interacting with others' maps

DROP POLICY IF EXISTS "Users can delete their own interactions" ON mind_map_interactions;
CREATE POLICY "Users can delete their own interactions"
  ON mind_map_interactions FOR DELETE
  USING (user_id = auth.uid());
