import { Alert } from 'react-native';

export function getErrorMessage(error: unknown, fallback = 'Ocurrió un error inesperado.') {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export function logError(context: string, error: unknown, meta?: Record<string, unknown>) {
  console.error(`[${context}]`, {
    message: getErrorMessage(error),
    error,
    meta,
  });
}

export function alertError(title: string, error: unknown, fallback?: string) {
  const message = getErrorMessage(error, fallback);
  logError(title, error);
  Alert.alert(title, message);
}
