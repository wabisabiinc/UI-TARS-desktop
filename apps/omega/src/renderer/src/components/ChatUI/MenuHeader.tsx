import Logo from '../../assets/logo.png';
import { IoShareSocialOutline } from 'react-icons/io5';
import {
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
} from 'react-icons/hi';
import { useAtom } from 'jotai';
import { showCanvasAtom } from '@renderer/state/canvas';
import { isReportHtmlMode } from '@renderer/constants';
import { useAppChat } from '@renderer/hooks/useAppChat';
import { useDisclosure } from '@nextui-org/react';
import { ShareModal } from './ShareModal';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function MenuHeader() {
  const [showCanvas, setShowCanvas] = useAtom(showCanvasAtom);
  const { messages } = useAppChat();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isShareHovered, setIsShareHovered] = useState(false);
  const [isPanelHovered, setIsPanelHovered] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const dragInterval = useRef<number | null>(null);

  // 检查窗口是否最大化
  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await window.electron.ipcRenderer.invoke(
        'window:is-maximized',
      );
      setIsMaximized(maximized);
    };

    checkMaximized();

    // 监听窗口大小变化
    const handleResize = () => {
      checkMaximized();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 处理双击标题栏
  const handleDoubleClick = async () => {
    const maximized =
      await window.electron.ipcRenderer.invoke('window:maximize');
    setIsMaximized(maximized);
  };

  // 窗口控制按钮处理函数
  const handleMinimize = () => {
    window.electron.ipcRenderer.invoke('window:minimize');
  };

  const handleMaximizeRestore = async () => {
    const maximized =
      await window.electron.ipcRenderer.invoke('window:maximize');
    setIsMaximized(maximized);
  };

  const handleClose = () => {
    window.electron.ipcRenderer.invoke('window:close');
  };

  // 处理拖拽开始
  const handleTitleBarMouseDown = (e: React.MouseEvent) => {
    if (isReportHtmlMode) return;

    // 只有左键点击才触发拖拽
    if (e.button !== 0) return;

    // 在 macOS 上使用原生拖拽
    if (process.platform === 'darwin') {
      window.electron.ipcRenderer.invoke('titlebar:drag');
      return;
    }

    // 在 Windows/Linux 上实现自定义拖拽
    setIsDragging(true);
    setDragStartPos({ x: e.clientX, y: e.clientY });

    // 使用 requestAnimationFrame 来平滑拖拽
    if (dragInterval.current === null) {
      let lastX = e.clientX;
      let lastY = e.clientY;

      dragInterval.current = window.setInterval(() => {
        if (
          isDragging &&
          (lastX !== dragStartPos.x || lastY !== dragStartPos.y)
        ) {
          window.electron.ipcRenderer.invoke('titlebar:drag', {
            mouseX: lastX - dragStartPos.x,
            mouseY: lastY - dragStartPos.y,
          });
          setDragStartPos({ x: lastX, y: lastY });
        }
      }, 16); // ~60fps
    }
  };

  // 处理拖拽过程
  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const lastX = e.clientX;
      const lastY = e.clientY;
      setDragStartPos({ x: lastX, y: lastY });
    }
  };

  // 处理拖拽结束
  const handleMouseUp = () => {
    setIsDragging(false);
    if (dragInterval.current !== null) {
      clearInterval(dragInterval.current);
      dragInterval.current = null;
    }
  };

  // 添加和移除全局事件监听器
  useEffect(() => {
    if (isReportHtmlMode) return;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (dragInterval.current !== null) {
        clearInterval(dragInterval.current);
      }
    };
  }, [isDragging, dragStartPos]);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full border-b border-divider backdrop-blur-md backdrop-saturate-150 px-6 py-3 sticky top-0 z-10 shadow-sm"
      onDoubleClick={handleDoubleClick}
      style={{
        WebkitAppRegion: 'drag', // 这是关键 - 使整个标题栏可拖动
        cursor: 'default',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Logo */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm overflow-hidden">
            <motion.img
              src={Logo}
              alt="Omega Logo"
              className="w-6 h-6 object-contain"
              whileHover={{ rotate: 10, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 300 }}
            />
          </div>

          {/* Brand name */}
          <motion.span
            className="font-semibold text-lg bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Omega
          </motion.span>
        </div>

        <div className="flex items-center gap-4">
          {/* 右侧内容 */}
          {!isReportHtmlMode && (
            <motion.button
              onMouseEnter={() => setIsShareHovered(true)}
              onMouseLeave={() => setIsShareHovered(false)}
              onClick={onOpen}
              className="p-2.5 rounded-xl bg-background hover:bg-primary/5 border border-divider hover:border-primary/30 transition-all duration-200 relative group"
              title="Share"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <IoShareSocialOutline
                size={20}
                className={`${isShareHovered ? 'text-primary' : 'text-foreground/70'} transition-colors duration-200`}
              />
              <motion.span
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={
                  isShareHovered
                    ? { opacity: 1, y: 0, scale: 1 }
                    : { opacity: 0, y: 10, scale: 0.8 }
                }
                className="absolute -bottom-8 left-0 transform -translate-x-1/2 text-xs bg-background/90 backdrop-blur-sm px-2 py-1 rounded-md border border-divider whitespace-nowrap"
              >
                Share
              </motion.span>
            </motion.button>
          )}

          {/* Toggle Panel Button */}
          <motion.button
            onMouseEnter={() => setIsPanelHovered(true)}
            onMouseLeave={() => setIsPanelHovered(false)}
            onClick={() => setShowCanvas(!showCanvas)}
            className="p-3 rounded-xl bg-background hover:bg-primary/5 border border-divider hover:border-primary/30 transition-all duration-200 relative group"
            title={showCanvas ? 'Hide Panel' : 'Show Panel'}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              {showCanvas ? (
                <HiOutlineChevronDoubleRight
                  size={20}
                  className={`${isPanelHovered ? 'text-primary' : 'text-foreground/70'} transition-colors duration-200`}
                />
              ) : (
                <HiOutlineChevronDoubleLeft
                  size={20}
                  className={`${isPanelHovered ? 'text-primary' : 'text-foreground/70'} transition-colors duration-200`}
                />
              )}
            </motion.div>
            <motion.span
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={
                isPanelHovered
                  ? { opacity: 1, y: 0, scale: 1 }
                  : { opacity: 0, y: 10, scale: 0.8 }
              }
              className="absolute -bottom-8 left-0 transform -translate-x-1/4 text-xs bg-background/90 backdrop-blur-sm px-2 py-1 rounded-md border border-divider whitespace-nowrap"
            >
              {showCanvas ? 'Hide' : 'Show'}
            </motion.span>
          </motion.button>

          {/* 窗口控制按钮 - 这些按钮需要设置为不可拖动 */}
          <div
            className="flex items-center"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <button
              onClick={handleMinimize}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              aria-label="Minimize"
            >
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path fill="currentColor" d="M14 8v1H3V8h11z" />
              </svg>
            </button>

            <button
              onClick={handleMaximizeRestore}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded mx-1"
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <path fill="currentColor" d="M3 5v9h9V5H3zm8 8H4V4h8v8z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <path fill="currentColor" d="M3 3v10h10V3H3zm9 9H4V4h8v8z" />
                </svg>
              )}
            </button>

            <button
              onClick={handleClose}
              className="p-1 hover:bg-red-500 hover:text-white rounded"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path
                  fill="currentColor"
                  d="M12.71 4.71l-1.42-1.42L8 6.59l-3.29-3.3-1.42 1.42L6.59 8l-3.3 3.29 1.42 1.42L8 9.41l3.29 3.3 1.42-1.42L9.41 8l3.3-3.29z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <ShareModal isOpen={isOpen} onClose={onClose} messages={messages} />
    </motion.header>
  );
}
