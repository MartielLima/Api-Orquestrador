export const theme = {
  headerGradient: ['#06b6d4', '#d946ef'] as const,
  sidebarActive: { bg: 'gray' as const, fg: 'white' as const, bold: true },
  status: {
    ok: 'green' as const,
    error: 'red' as const,
    cacheHit: 'cyan' as const,
    pending: 'yellow' as const,
  },
  dim: 'gray' as const,
  border: 'white' as const,
  modal: { border: 'cyan' as const, padding: 1 },
};
