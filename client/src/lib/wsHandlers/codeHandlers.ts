import type { CodeSearchResponse, CodeMapResponse } from '@/store/contextStore';
import type { NotificationHandler } from './types';

export const codeSearchResult: NotificationHandler = (params, deps) => {
  const ctxStore = deps.ctxStore.getState();
  ctxStore.setCodeSearchResults(params as unknown as CodeSearchResponse);
};

export const codeMapResult: NotificationHandler = (params, deps) => {
  const ctxStore = deps.ctxStore.getState();
  ctxStore.setCodeMap(params as unknown as CodeMapResponse);
};
