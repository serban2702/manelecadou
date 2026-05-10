'use client';

import * as React from 'react';
import type { ToastActionElement, ToastProps } from './toast';

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = { toasts: ToasterToast[] };

type Action =
  | { type: 'ADD'; toast: ToasterToast }
  | { type: 'UPDATE'; toast: Partial<ToasterToast> & { id: string } }
  | { type: 'DISMISS'; id?: string }
  | { type: 'REMOVE'; id?: string };

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD':
      return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case 'UPDATE':
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      };
    case 'DISMISS':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          action.id === undefined || t.id === action.id ? { ...t, open: false } : t,
        ),
      };
    case 'REMOVE':
      if (action.id === undefined) return { ...state, toasts: [] };
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
};

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(memoryState));
}

type ToastInput = Omit<ToasterToast, 'id'>;

function toast(props: ToastInput) {
  const id = genId();
  const update = (next: Partial<ToasterToast>) =>
    dispatch({ type: 'UPDATE', toast: { ...next, id } });
  const dismiss = () => dispatch({ type: 'DISMISS', id });

  dispatch({
    type: 'ADD',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open) dismiss();
      },
    },
  });

  setTimeout(() => dispatch({ type: 'REMOVE', id }), TOAST_REMOVE_DELAY + 200);

  return { id, update, dismiss };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const i = listeners.indexOf(setState);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (id?: string) => dispatch({ type: 'DISMISS', id }),
  };
}

export { useToast, toast };
