'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import {
  FileText,
  Code2,
  Pen,
  FileIcon,
  Video,
  Brain,
  GraduationCap,
  ListChecks,
  Network,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  MoveIcon
} from 'lucide-react';

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

const OnboardingStep: React.FC<{
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-foreground">{title}</h2>
        <p className="text-muted-foreground text-lg">{description}</p>
      </div>
      {children}
    </div>
  );
};

const FeatureCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => {
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-accent/50 border border-border hover:bg-accent/70 transition-colors">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ open, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    // Step 1: Instance Modes
    <OnboardingStep
      key="instance-modes"
      title="Welcome to Mimir!"
      description="Your AI-native learning platform for STEM education"
    >
      <div className="space-y-3">
        <p className="text-center text-muted-foreground mb-4">
          Mimir offers different workspace types for all your learning needs:
        </p>

        <div className="grid gap-3">
          <FeatureCard
            icon={<FileText size={20} />}
            title="Text Workspace"
            description="Take notes, write essays, and organize your thoughts with a rich text editor."
          />
          <FeatureCard
            icon={<Code2 size={20} />}
            title="Code Workspace"
            description="Write and run code in multiple languages with full IDE features."
          />
          <FeatureCard
            icon={<Pen size={20} />}
            title="Annotate Workspace"
            description="Draw diagrams, sketch concepts, and create visual explanations."
          />
          <FeatureCard
            icon={<FileIcon size={20} />}
            title="PDF Workspace"
            description="Upload and study from PDFs, textbooks, and research papers."
          />
          <FeatureCard
            icon={<Video size={20} />}
            title="Lecture Workspace"
            description="Import lectures from YouTube, recordings, or slides for AI-assisted review."
          />
        </div>
      </div>
    </OnboardingStep>,

    // Step 2: Study Materials
    <OnboardingStep
      key="study-materials"
      title="AI-Powered Study Materials"
      description="Generate personalized study resources from any content"
    >
      <div className="space-y-3">
        <p className="text-center text-muted-foreground mb-4">
          Mimir automatically creates study materials to help you master any topic:
        </p>

        <div className="grid gap-3">
          <FeatureCard
            icon={<Brain size={20} />}
            title="Flashcards"
            description="AI-generated flashcard sets with spaced repetition to optimize your learning."
          />
          <FeatureCard
            icon={<ListChecks size={20} />}
            title="Quizzes"
            description="Practice with auto-generated quizzes that test your understanding."
          />
          <FeatureCard
            icon={<FileText size={20} />}
            title="Summaries"
            description="Get concise summaries of complex topics and lengthy content."
          />
          <FeatureCard
            icon={<Network size={20} />}
            title="Mind Maps"
            description="Visualize connections between concepts with interactive mind maps."
          />
        </div>

        <div className="mt-6 p-4 bg-primary/10 rounded-lg border border-primary/20">
          <p className="text-sm text-foreground flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            <span>Study materials are generated for each workspace and adapt to your content!</span>
          </p>
        </div>
      </div>
    </OnboardingStep>,

    // Step 3: Focus View
    <OnboardingStep
      key="focus-view"
      title="Focus View"
      description="Organize your learning with drag-and-drop flexibility"
    >
      <div className="space-y-4">
        <p className="text-center text-muted-foreground mb-4">
          The Focus View lets you arrange your workspaces exactly how you need them:
        </p>

        <div className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <MoveIcon size={24} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">Drag and Arrange</h3>
              <p className="text-sm text-muted-foreground">Move workspaces around to create your perfect layout</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-primary mt-2" />
              <div>
                <p className="text-sm text-foreground font-medium">Flexible Layouts</p>
                <p className="text-sm text-muted-foreground">Place instances side-by-side, stack them, or create custom arrangements</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-primary mt-2" />
              <div>
                <p className="text-sm text-foreground font-medium">Multi-Instance View</p>
                <p className="text-sm text-muted-foreground">Work with multiple workspaces simultaneously for cross-referencing</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-primary mt-2" />
              <div>
                <p className="text-sm text-foreground font-medium">AI Chat Integration</p>
                <p className="text-sm text-muted-foreground">Ask questions about any workspace with full context awareness</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-accent rounded-lg border border-border">
          <p className="text-sm text-center text-muted-foreground">
            Access Focus View anytime from the sidebar to customize your learning environment!
          </p>
        </div>
      </div>
    </OnboardingStep>,
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  // Don't allow closing with Escape or backdrop click during onboarding
  const handleClose = () => {
    // Intentionally do nothing - user must complete or skip
  };

  return (
    <Modal open={open} onClose={handleClose} containerClassName="pt-20">
      <div className="p-8">
        {steps[currentStep]}

        {/* Progress Indicator */}
        <div className="flex justify-center gap-2 mt-8 mb-6">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-2 rounded-full transition-all ${
                index === currentStep
                  ? 'w-8 bg-primary'
                  : 'w-2 bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground"
          >
            Skip Tutorial
          </Button>

          <div className="flex gap-3">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={handlePrevious}
                className="gap-2"
              >
                <ArrowLeft size={16} />
                Previous
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleNext}
              className="gap-2"
            >
              {currentStep === steps.length - 1 ? "Get Started" : "Next"}
              {currentStep < steps.length - 1 && <ArrowRight size={16} />}
              {currentStep === steps.length - 1 && <GraduationCap size={16} />}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
