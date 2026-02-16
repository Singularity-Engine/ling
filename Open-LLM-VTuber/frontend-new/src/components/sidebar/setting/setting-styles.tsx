const isElectron = window.api !== undefined;
export const settingStyles = {
  settingUI: {
    container: {
      width: '100%',
      height: '100%',
      p: 4,
      gap: 4,
      position: 'relative',
      overflowY: 'auto',
      css: {
        '&::-webkit-scrollbar': {
          width: '4px',
        },
        '&::-webkit-scrollbar-track': {
          bg: 'whiteAlpha.100',
          borderRadius: 'full',
        },
        '&::-webkit-scrollbar-thumb': {
          bg: 'whiteAlpha.300',
          borderRadius: 'full',
        },
      },
    },
    header: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 1,
    },
    title: {
      ml: 4,
      fontSize: 'lg',
      fontWeight: 'bold',
    },
    tabs: {
      root: {
        width: '100%',
        variant: 'plain' as const,
        colorPalette: 'gray',
      },
      content: {},
      trigger: {
        color: 'whiteAlpha.500',
        fontSize: 'sm',
        fontWeight: 'medium',
        px: 3,
        py: 1.5,
        borderRadius: 'md',
        transition: 'all 0.2s ease',
        _selected: {
          color: 'white',
          bg: 'whiteAlpha.100',
          fontWeight: 'semibold',
        },
        _hover: {
          color: 'whiteAlpha.800',
          bg: 'whiteAlpha.50',
        },
      },
      list: {
        display: 'flex',
        justifyContent: 'flex-start',
        width: '100%',
        borderBottom: '1px solid',
        borderColor: 'whiteAlpha.100',
        mb: 4,
        pl: 0,
        gap: 0.5,
        pb: 1,
      },
    },
    footer: {
      width: '100%',
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 2,
      mt: 'auto',
      pt: 4,
      borderTop: '1px solid',
      borderColor: 'whiteAlpha.200',
    },
    drawerContent: {
      bg: 'rgba(15, 15, 20, 0.85)',
      backdropFilter: 'blur(24px) saturate(180%)',
      maxWidth: '440px',
      height: isElectron ? 'calc(100vh - 30px)' : '100vh',
      borderRight: '1px solid',
      borderColor: 'whiteAlpha.100',
    },
    drawerHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      position: 'relative',
      px: 6,
      py: 4,
      borderBottom: '1px solid',
      borderColor: 'whiteAlpha.100',
    },
    drawerTitle: {
      color: 'white',
      fontSize: 'lg',
      fontWeight: 'semibold',
      letterSpacing: '0.02em',
    },
    closeButton: {
      position: 'absolute',
      right: 1,
      top: 1,
      color: 'white',
    },
  },
  general: {
    container: {
      align: 'stretch',
      gap: 6,
      p: 4,
    },
    field: {
      label: {
        color: 'whiteAlpha.800',
      },
    },
    select: {
      root: {
        colorPalette: 'gray',
        bg: 'whiteAlpha.50',
      },
      trigger: {
        bg: 'whiteAlpha.50',
        borderColor: 'whiteAlpha.100',
        borderRadius: 'lg',
        transition: 'all 0.2s ease',
        _hover: {
          bg: 'whiteAlpha.100',
          borderColor: 'whiteAlpha.200',
        },
      },
    },
    input: {
      bg: 'whiteAlpha.50',
      borderColor: 'whiteAlpha.100',
      borderRadius: 'lg',
      transition: 'all 0.2s ease',
      _hover: {
        bg: 'whiteAlpha.100',
        borderColor: 'whiteAlpha.200',
      },
      _focus: {
        bg: 'whiteAlpha.100',
        borderColor: 'blue.400',
        boxShadow: '0 0 0 1px var(--chakra-colors-blue-400)',
      },
    },
    buttonGroup: {
      gap: 4,
      width: '100%',
    },
    button: {
      width: '50%',
      variant: 'outline' as const,
      bg: 'blue',
      color: 'white',
      _hover: {
        bg: 'whiteAlpha.300',
      },
    },
    fieldLabel: {
      fontSize: '14px',
      color: 'gray.600',
    },
  },
  common: {
    field: {
      orientation: 'horizontal' as const,
    },
    fieldLabel: {
      fontSize: 'sm',
      color: 'whiteAlpha.700',
      whiteSpace: 'nowrap' as const,
    },
    switch: {
      size: 'md' as const,
      colorPalette: 'blue' as const,
      variant: 'solid' as const,
    },
    numberInput: {
      root: {
        pattern: '[0-9]*\\.?[0-9]*',
        inputMode: 'decimal' as const,
      },
      input: {
        bg: 'whiteAlpha.50',
        borderColor: 'whiteAlpha.100',
        borderRadius: 'lg',
        transition: 'all 0.2s ease',
        _hover: {
          bg: 'whiteAlpha.100',
          borderColor: 'whiteAlpha.200',
        },
        _focus: {
          bg: 'whiteAlpha.100',
          borderColor: 'blue.400',
          boxShadow: '0 0 0 1px var(--chakra-colors-blue-400)',
        },
      },
    },
    container: {
      gap: 8,
      maxW: 'sm',
      css: { '--field-label-width': '120px' },
    },
    input: {
      bg: 'whiteAlpha.50',
      borderColor: 'whiteAlpha.100',
      borderRadius: 'lg',
      transition: 'all 0.2s ease',
      _hover: {
        bg: 'whiteAlpha.100',
        borderColor: 'whiteAlpha.200',
      },
      _focus: {
        bg: 'whiteAlpha.100',
        borderColor: 'blue.400',
        boxShadow: '0 0 0 1px var(--chakra-colors-blue-400)',
      },
    },
    // Reusable section card style for grouping related settings
    sectionCard: {
      bg: 'whiteAlpha.50',
      border: '1px solid',
      borderColor: 'whiteAlpha.100',
      borderRadius: 'xl',
      p: 4,
      backdropFilter: 'blur(8px)',
      transition: 'all 0.2s ease',
      _hover: {
        borderColor: 'whiteAlpha.150',
      },
    },
    sectionTitle: {
      fontSize: 'xs',
      fontWeight: 'semibold',
      color: 'whiteAlpha.500',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.08em',
      mb: 3,
    },
  },
  live2d: {
    container: {
      gap: 8,
      maxW: 'sm',
      css: { '--field-label-width': '120px' },
    },
    emotionMap: {
      title: {
        fontWeight: 'bold',
        mb: 4,
      },
      entry: {
        mb: 2,
      },
      button: {
        colorPalette: 'blue',
        mt: 2,
      },
      deleteButton: {
        colorPalette: 'red',
      },
    },
  },
};
