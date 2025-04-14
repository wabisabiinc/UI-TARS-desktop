import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { type ConversationWithSoM } from '@main/shared/types';
import Image from '@renderer/components/Image';

interface ImageGalleryProps {
  selectImgIndex?: number;
  messages: ConversationWithSoM[];
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  messages,
  selectImgIndex,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const imageEntries = useMemo(() => {
    return messages
      .map((msg, index) => ({
        originalIndex: index,
        message: msg,
        imageData:
          msg.screenshotBase64 || msg.screenshotBase64WithElementMarker,
      }))
      .filter((entry) => entry.imageData);
  }, [messages]);

  useEffect(() => {
    if (typeof selectImgIndex === 'number') {
      const targetIndex = imageEntries.findIndex(
        (entry) => entry.originalIndex === selectImgIndex,
      );
      if (targetIndex !== -1) {
        setCurrentIndex(targetIndex);
      }
    }
    console.log('selectImgIndex', selectImgIndex);
  }, [selectImgIndex, imageEntries]);

  const handlePrevious = () => {
    setCurrentIndex(
      (current) => (current - 1 + imageEntries.length) % imageEntries.length,
    );
  };

  const handleNext = () => {
    setCurrentIndex((current) => (current + 1) % imageEntries.length);
  };

  if (imageEntries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No images to display
      </div>
    );
  }

  const currentEntry = imageEntries[currentIndex];
  const mime = currentEntry.message.screenshotContext?.mime || 'image/png';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative">
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <Image
            src={`data:${mime};base64,${currentEntry.imageData}`}
            alt={`screenshot from message ${currentEntry.originalIndex + 1}`}
          />
        </div>
      </div>
      <div className="p-4 flex items-center justify-center gap-4 border-t">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePrevious}
          disabled={imageEntries.length <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm">
          {currentIndex + 1} / {imageEntries.length}
          {/* (Message{' '}{currentEntry.originalIndex + 1}) */}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={handleNext}
          disabled={imageEntries.length <= 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default ImageGallery;
