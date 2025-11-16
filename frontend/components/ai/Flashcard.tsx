import React, { useState } from 'react';
import { Card } from '@/components/common';

interface FlashcardProps {
  front: React.ReactNode;
  back: React.ReactNode;
}

const Flashcard: React.FC<FlashcardProps> = ({ front, back }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  return (
    <div
      className="w-full h-64 perspective-1000"
      onClick={handleFlip}
      onKeyPress={handleFlip}
      role="button"
      tabIndex={0}
    >
      <div
        className={`relative w-full h-full transition-transform duration-700 transform-style-preserve-3d ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        <div className="absolute w-full h-full backface-hidden">
          <Card className="w-full h-full flex items-center justify-center">
            <div className="text-center">{front}</div>
          </Card>
        </div>
        <div className="absolute w-full h-full backface-hidden rotate-y-180">
          <Card className="w-full h-full flex items-center justify-center">
            <div className="text-center">{back}</div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Flashcard;
