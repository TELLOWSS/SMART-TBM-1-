import React from 'react';
import { createPortal } from 'react-dom';
import { type ConfirmVariant } from '../../hooks/useConfirmDialog';

type ConfirmDialogProps = {
    isOpen: boolean;
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    zIndexClassName?: string;
    variant?: ConfirmVariant;
};

const CONFIRM_BUTTON_STYLES: Record<ConfirmVariant, string> = {
    default: 'bg-slate-900 text-white hover:bg-slate-800',
    danger:  'bg-red-600 text-white hover:bg-red-700',
    warning: 'bg-amber-500 text-white hover:bg-amber-600',
};

export const ConfirmDialog = ({
    isOpen,
    title = '확인',
    message,
    confirmLabel = '확인',
    cancelLabel = '취소',
    onConfirm,
    onCancel,
    zIndexClassName = 'z-[1000000]',
    variant = 'default'
}: ConfirmDialogProps) => {
    const dialogRef = React.useRef<HTMLDivElement>(null);
    const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
    const previouslyFocusedElementRef = React.useRef<HTMLElement | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;

        previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
        window.setTimeout(() => {
            cancelButtonRef.current?.focus();
        }, 0);

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onCancel();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('keydown', handleEscape);
            window.setTimeout(() => {
                previouslyFocusedElementRef.current?.focus();
            }, 0);
        };
    }, [isOpen, onCancel]);

    const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab') return;

        const dialogNode = dialogRef.current;
        if (!dialogNode) return;

        const focusableElements = dialogNode.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
            if (activeElement === firstElement || !dialogNode.contains(activeElement)) {
                event.preventDefault();
                lastElement.focus();
            }
            return;
        }

        if (activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className={`fixed inset-0 ${zIndexClassName} bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in`} onClick={onCancel}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description" onKeyDown={handleDialogKeyDown} onClick={(event) => event.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6">
                <h2 id="confirm-dialog-title" className="text-lg font-black text-slate-800 mb-2">{title}</h2>
                <p id="confirm-dialog-description" className="text-sm text-slate-600 whitespace-pre-line">{message}</p>
                <div className="mt-6 flex justify-end gap-2">
                    <button ref={cancelButtonRef} type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50">
                        {cancelLabel}
                    </button>
                    <button type="button" onClick={onConfirm} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${CONFIRM_BUTTON_STYLES[variant]}`}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
