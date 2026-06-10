import React from 'react';

export type ConfirmVariant = 'default' | 'danger' | 'warning';

export type ConfirmDialogState = {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    variant: ConfirmVariant;
};

export type ConfirmRequestOptions = {
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmVariant;
};

const DEFAULT_CONFIRM_STATE: ConfirmDialogState = {
    isOpen: false,
    title: '확인',
    message: '',
    confirmLabel: '확인',
    cancelLabel: '취소',
    variant: 'default'
};

export const useConfirmDialog = () => {
    const [confirmDialogState, setConfirmDialogState] = React.useState<ConfirmDialogState>(DEFAULT_CONFIRM_STATE);
    const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

    const requestConfirm = (message: string, options?: ConfirmRequestOptions) => {
        return new Promise<boolean>((resolve) => {
            resolverRef.current = resolve;
            setConfirmDialogState({
                isOpen: true,
                title: options?.title ?? '확인',
                message,
                confirmLabel: options?.confirmLabel ?? '확인',
                cancelLabel: options?.cancelLabel ?? '취소',
                variant: options?.variant ?? 'default'
            });
        });
    };

    const closeConfirmDialog = (result: boolean) => {
        setConfirmDialogState(prev => ({ ...prev, isOpen: false }));
        const resolver = resolverRef.current;
        resolverRef.current = null;
        resolver?.(result);
    };

    React.useEffect(() => {
        return () => {
            if (resolverRef.current) {
                resolverRef.current(false);
                resolverRef.current = null;
            }
        };
    }, []);

    return {
        confirmDialogState,
        requestConfirm,
        closeConfirmDialog
    };
};
