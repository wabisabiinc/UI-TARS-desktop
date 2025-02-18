/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Image as ChakraImage,
  ImageProps,
  Box,
  useToast,
} from '@chakra-ui/react';
import clsx from 'clsx';
import mediumZoom, { type Zoom } from 'medium-zoom';
import React, { useEffect, useRef, useState } from 'react';
import { TbCopy, TbCopyCheckFilled } from 'react-icons/tb';

const SnapshotImage: React.FC<ImageProps> = (props) => {
  const { className, ...rest } = props;
  const [copied, setCopied] = useState<boolean>(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const toast = useToast({
    title: 'Failed to copy image!',
    status: 'warning',
    position: 'top',
    duration: 3000,
    isClosable: true,
    onCloseComplete() {
      setCopied(false);
    },
  });
  const handleCopyImage = async () => {
    if (imgRef.current) {
      try {
        const imageUrl = imgRef.current.src;
        let img: HTMLImageElement | null = new Image();
        img.src = imageUrl;
        img.onload = async () => {
          try {
            // use canvas to copy image, avoid csp issue in data:url
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx && img) {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);

              // get blob from canvas
              canvas.toBlob(async (blob) => {
                if (blob) {
                  const item = new ClipboardItem({ 'image/png': blob });
                  await navigator.clipboard.write([item]);
                }
                canvas.width = 0;
                canvas.height = 0;
              });

              // clear
              img.src = '';
              img.onload = null;
              img = null;
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
              }, 500);
            }
          } catch (error) {
            toast({
              description: error instanceof Error ? error.message : `${error}`,
            });
          }
        };
      } catch (error) {
        toast({
          description: error instanceof Error ? error.message : `${error}`,
        });
      }
    }
  };

  useEffect(() => {
    let zoom: Zoom | undefined;
    const initZoom = () => {
      if (imgRef.current) {
        zoom = mediumZoom(imgRef.current, {
          background: 'rgba(0,0,0,.7)',
          margin: 50,
        });
      }
    };
    requestAnimationFrame(initZoom);
    return () => {
      zoom?.detach();
      zoom?.close();
    };
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDir: 'column',
        alignItems: 'end',
        position: 'relative',
      }}
    >
      <ChakraImage
        ref={imgRef}
        className={clsx('snapshot', className)}
        {...rest}
      />
      <Box
        onClick={handleCopyImage}
        sx={{
          width: '24px',
          height: '24px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          bottom: '8px',
          right: '8px',
          position: 'absolute',
          opacity: 0.1,
          cursor: 'pointer',
          transition: 'opacity 0.2s',
          _hover: { opacity: 0.5 },
          _focus: {
            outline: 'none',
          },
        }}
      >
        {copied ? <TbCopyCheckFilled /> : <TbCopy />}
      </Box>
    </Box>
  );
};

export default SnapshotImage;
