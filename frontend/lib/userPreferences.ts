import { supabase } from './supabaseClient';
import type { UserPreferences } from './types';

/**
 * Utilities for managing user preferences
 */

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    // If no preferences exist yet, return null
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching user preferences:', error);
    throw error;
  }

  // Convert snake_case to camelCase
  return {
    id: data.id,
    userId: data.user_id,
    hasCompletedOnboarding: data.has_completed_onboarding,
    onboardingCompletedAt: data.onboarding_completed_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function createUserPreferences(userId: string): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .insert({
      user_id: userId,
      has_completed_onboarding: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating user preferences:', error);
    throw error;
  }

  // Convert snake_case to camelCase
  return {
    id: data.id,
    userId: data.user_id,
    hasCompletedOnboarding: data.has_completed_onboarding,
    onboardingCompletedAt: data.onboarding_completed_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_preferences')
    .update({
      has_completed_onboarding: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Error marking onboarding as complete:', error);
    throw error;
  }
}

export async function getOrCreateUserPreferences(userId: string): Promise<UserPreferences> {
  let preferences = await getUserPreferences(userId);

  if (!preferences) {
    preferences = await createUserPreferences(userId);
  }

  return preferences;
}
