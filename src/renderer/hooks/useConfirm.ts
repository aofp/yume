import { useState, useCallback } from 'react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
}

export function useConfirm() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: '',
    message: ''
  });
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      setResolvePromise(() => resolve);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    if (resolvePromise) {
      // Add small delay to prevent accidental double-clicks
      setTimeout(() => {
        resolvePromise(true);
        setResolvePromise(null);
      }, 100);
    }
  }, [resolvePromise]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(false);
      setResolvePromise(null);
    }
  }, [resolvePromise]);

  return {
    confirm,
    isOpen,
    options,
    handleConfirm,
    handleCancel
  };
}

// Example usage:
// const { confirm, isOpen, options, handleConfirm, handleCancel } = useConfirm();
//
// const handleDelete = async () => {
//   const confirmed = await confirm({
//     title: 'Delete Item',
//     message: 'Are you sure you want to delete this item?',
//     isDangerous: true
//   });
//   
//   if (confirmed) {
//     // Perform delete action
//   }
// };
//
// And in the render:
// <ConfirmModal
//   isOpen={isOpen}
//   {...options}
//   onConfirm={handleConfirm}
//   onCancel={handleCancel}
// />