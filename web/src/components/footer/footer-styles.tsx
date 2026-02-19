import { SystemStyleObject } from '@chakra-ui/react';

interface FooterStyles {
  container: (isCollapsed: boolean) => SystemStyleObject
  toggleButton: SystemStyleObject
  actionButton: SystemStyleObject
  input: SystemStyleObject
  attachButton: SystemStyleObject
}

interface AIIndicatorStyles {
  container: SystemStyleObject
  text: SystemStyleObject
}

export const footerStyles: {
  footer: FooterStyles
  aiIndicator: AIIndicatorStyles
} = {
  footer: {
    container: (isCollapsed) => ({
      bg: isCollapsed
        ? 'transparent'
        : { base: 'transparent', md: 'rgba(10, 0, 21, 0.55)' },
      backdropFilter: isCollapsed ? 'none' : { base: 'none', md: 'blur(20px)' },
      WebkitBackdropFilter: isCollapsed ? 'none' : { base: 'none', md: 'blur(20px)' },
      borderTop: isCollapsed
        ? 'none'
        : { base: 'none', md: '1px solid rgba(139, 92, 246, 0.15)' },
      borderTopRadius: isCollapsed ? 'none' : { base: 'none', md: '16px' },
      transform: isCollapsed ? 'translateY(calc(100% - 24px))' : 'translateY(0)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      height: '100%',
      position: 'relative',
      overflow: isCollapsed ? 'visible' : 'hidden',
      pb: '4',
    }),
    toggleButton: {
      height: '24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: 'whiteAlpha.500',
      _hover: {
        color: 'whiteAlpha.900',
        filter: 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.5))',
      },
      bg: 'transparent',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    },
    actionButton: {
      borderRadius: '14px',
      width: '50px',
      height: '50px',
      minW: '50px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      _hover: {
        transform: 'scale(1.08)',
        filter: 'brightness(1.15)',
        boxShadow: '0 0 18px rgba(139, 92, 246, 0.35), 0 0 6px rgba(139, 92, 246, 0.2)',
        borderColor: 'rgba(139, 92, 246, 0.4)',
      },
      _active: {
        transform: 'scale(0.93)',
        filter: 'brightness(0.85)',
        boxShadow: '0 0 8px rgba(139, 92, 246, 0.2)',
      },
    },
    input: {
      bg: 'rgba(255, 255, 255, 0.06)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      height: '80px',
      borderRadius: '14px',
      fontSize: '18px',
      pl: '12',
      pr: '4',
      color: 'whiteAlpha.900',
      _placeholder: {
        color: 'whiteAlpha.400',
      },
      _focus: {
        border: '1px solid rgba(139, 92, 246, 0.5)',
        bg: 'rgba(255, 255, 255, 0.08)',
        boxShadow: '0 0 0 2px rgba(139, 92, 246, 0.25), 0 0 20px rgba(139, 92, 246, 0.1)',
      },
      resize: 'none',
      minHeight: '80px',
      maxHeight: '80px',
      py: '0',
      display: 'flex',
      alignItems: 'center',
      paddingTop: '28px',
      lineHeight: '1.4',
      transition: 'all 0.2s ease',
    },
    attachButton: {
      position: 'absolute',
      left: '1',
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'whiteAlpha.500',
      zIndex: 2,
      _hover: {
        bg: 'transparent',
        color: 'whiteAlpha.900',
        filter: 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.4))',
      },
      transition: 'all 0.2s ease',
    },
  },
  aiIndicator: {
    container: {
      bg: 'linear-gradient(135deg, rgba(139, 92, 246, 0.85), rgba(109, 40, 217, 0.85))',
      color: 'white',
      width: '110px',
      height: '30px',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 0 12px rgba(139, 92, 246, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)',
      overflow: 'hidden',
      border: '1px solid rgba(139, 92, 246, 0.3)',
      animation: 'indicatorBreathe 3s ease-in-out infinite',
    },
    text: {
      fontSize: '12px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontWeight: '500',
      letterSpacing: '0.3px',
    },
  },
};
