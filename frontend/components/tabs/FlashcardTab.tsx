'use client';

import React, { useState, useCallback } from 'react';
import { Button, Card } from '@/components/common';
import Flashcard from '@/components/ai/Flashcard';

interface FlashcardData {
  front: string;
  back: string;
}

const FlashcardTab: React.FC = () => {
  const [flashcards, setFlashcards] = useState<FlashcardData[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateFlashcards = useCallback(async () => {
    // Note: This component is currently not used in the main app.
    // Flashcard functionality is available in the PDF Study Panel.
    setError('Flashcard generation is available in the PDF Study Panel. Please use the Quiz tab when viewing a PDF.');
  }, []);

  const goToNextCard = () => {
    if (flashcards.length > 0) {
      setCurrentCardIndex((prevIndex) => (prevIndex + 1) % flashcards.length);
    }
  };

  const goToPreviousCard = () => {
    if (flashcards.length > 0) {
      setCurrentCardIndex((prevIndex) => (prevIndex - 1 + flashcards.length) % flashcards.length);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <h2 className="text-2xl font-bold mb-4">Flashcards</h2>
      {error && (
        <Card className="bg-red-100 border-red-400 text-red-700 p-4 mb-4">
          <p>
            <strong>Error:</strong> {error}
          </p>
        </Card>
      )}
      {flashcards.length === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center">
          <p className="text-gray-500 mb-4">
            {isLoading ? 'Generating flashcards...' : 'Click the button to generate flashcards from the PDF.'}
          </p>
          <Button
            onClick={generateFlashcards}
            disabled={isLoading}
          >
            {isLoading ? 'Generating...' : 'Generate Flashcards'}
          </Button>
          <p className="text-sm text-gray-400 mt-2">
            Note: Flashcard functionality is available in the PDF Study Panel.
          </p>
        </div>
      ) : (
        <div className="flex-grow flex flex-col items-center">
          <div className="w-full max-w-2xl mb-4">
            <Flashcard
              front={flashcards[currentCardIndex].front}
              back={flashcards[currentCardIndex].back}
            />
          </div>
          <div className="flex items-center justify-between w-full max-w-2xl">
            <Button onClick={goToPreviousCard}>Previous</Button>
            <p className="text-sm text-gray-500">
              Card {currentCardIndex + 1} of {flashcards.length}
            </p>
            <Button onClick={goToNextCard}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlashcardTab;
