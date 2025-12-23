import { createTheme } from '@mui/material/styles';

export const getTheme = (mode = 'light') =>
  createTheme({
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 900,
        lg: 1200,
        xl: 1536,
      },
    },
    palette: {
      mode,
      primary: {
        main: '#005b96',        // Primary Blue
        dark: '#011f4b',        // Primary Dark
        light: '#6497b1',       // Light Blue
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#03396c',        // Primary Mid
        light: '#b3cde0',       // Very Light Blue
        contrastText: '#ffffff',
      },
      background: mode === 'light'
        ? {
            default: '#f8fafc',
            paper: '#ffffff',
          }
        : {
            default: '#0f172a',
            paper: '#1e293b',
          },
      text: {
        primary: mode === 'light' ? '#011f4b' : '#f8fafc',
        secondary: mode === 'light' ? '#03396c' : '#b3cde0',
      },
    },
    shape: { 
      borderRadius: 8 
    },
    // Compact spacing - reduce overall size by ~10%
    spacing: 7,
    typography: {
      fontFamily: '"Inter", "Roboto", "Arial", sans-serif',
      // Headers increased significantly for better visibility, base fonts increased
      fontSize: 15,
      htmlFontSize: 18,
      h1: {
        fontSize: '2.8rem',
        fontWeight: 700,
        lineHeight: 1.2,
      },
      h2: {
        fontSize: '2.4rem',
        fontWeight: 700,
        lineHeight: 1.3,
      },
      h3: {
        fontSize: '2rem',
        fontWeight: 600,
        lineHeight: 1.3,
      },
      h4: {
        fontSize: '1.6rem',
        fontWeight: 600,
        lineHeight: 1.4,
      },
      h5: {
        fontSize: '1.3rem',
        fontWeight: 600,
        lineHeight: 1.4,
      },
      h6: {
        fontSize: '1.1rem',
        fontWeight: 600,
        lineHeight: 1.4,
      },
      subtitle1: {
        fontSize: '1.05rem',
        fontWeight: 500,
      },
      subtitle2: {
        fontSize: '0.95rem',
        fontWeight: 500,
      },
      body1: {
        fontSize: '1rem',
      },
      body2: {
        fontSize: '0.9rem',
      },
      button: {
        fontSize: '0.95rem',
        fontWeight: 600,
        textTransform: 'none',
      },
      caption: {
        fontSize: '0.8rem',
      },
      overline: {
        fontSize: '0.75rem',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: {
            // Base font size increased for better readability
            fontSize: '16px',
          },
          body: {
            fontSize: '1rem',
            lineHeight: 1.5,
          },
        },
      },
      MuiButton: {
        defaultProps: {
          size: 'small',
        },
        styleOverrides: {
          root: ({ theme }) => ({
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 8,
            padding: '6px 16px',
            fontSize: '0.84rem',
            lineHeight: 1.5,
            minHeight: 32,
            transition: 'all 0.2s ease',
            boxShadow: 'none',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(0, 91, 150, 0.15)',
              transform: 'translateY(-1px)',
            },
            '&:active': {
              transform: 'translateY(0)',
            },
          }),
          sizeSmall: {
            padding: '4px 12px',
            fontSize: '0.7875rem',
            minHeight: 28,
            borderRadius: 6,
          },
          sizeMedium: {
            padding: '6px 16px',
            fontSize: '0.84rem',
            minHeight: 32,
          },
          sizeLarge: {
            padding: '8px 20px',
            fontSize: '0.8925rem',
            minHeight: 36,
          },
          contained: {
            background: 'linear-gradient(135deg, #005b96 0%, #03396c 100%)',
            color: '#ffffff',
            '&:hover': {
              background: 'linear-gradient(135deg, #03396c 0%, #011f4b 100%)',
            },
            '&:disabled': {
              background: '#b3cde0',
              color: 'rgba(255, 255, 255, 0.7)',
            },
          },
          outlined: {
            borderWidth: '1.5px',
            borderColor: '#005b96',
            color: '#005b96',
            '&:hover': {
              borderColor: '#03396c',
              backgroundColor: 'rgba(0, 91, 150, 0.04)',
              borderWidth: '1.5px',
            },
          },
        },
      },
      MuiIconButton: {
        defaultProps: {
          size: 'small',
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            padding: '6px',
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: 'rgba(0, 91, 150, 0.08)',
            },
          },
          sizeSmall: {
            padding: '4px',
          },
          sizeMedium: {
            padding: '6px',
          },
        },
      },
      MuiAvatar: {
        styleOverrides: {
          root: {
            width: 32,
            height: 32,
            fontSize: '0.8925rem',
          },
        },
      },
      MuiChip: {
        defaultProps: {
          size: 'small',
        },
        styleOverrides: {
          root: {
            height: 24,
            fontSize: '0.735rem',
            borderRadius: 6,
          },
          sizeSmall: {
            height: 20,
            fontSize: '0.6825rem',
          },
          icon: {
            fontSize: '0.8925rem',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            boxShadow: '0 2px 8px rgba(0, 91, 150, 0.08)',
            border: '1px solid rgba(0, 91, 150, 0.08)',
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: '0 4px 16px rgba(0, 91, 150, 0.12)',
              transform: 'translateY(-2px)',
            },
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            padding: '14px',
            '&:last-child': {
              paddingBottom: '14px',
            },
          },
        },
      },
      MuiCardHeader: {
        styleOverrides: {
          root: {
            padding: '12px 14px',
          },
          title: {
            fontSize: '0.9975rem',
            fontWeight: 600,
          },
          subheader: {
            fontSize: '0.7875rem',
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: 'small',
        },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
              fontSize: '0.8925rem',
              '& fieldset': {
                borderColor: 'rgba(0, 91, 150, 0.2)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(0, 91, 150, 0.4)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#005b96',
                borderWidth: '1.5px',
              },
            },
            '& .MuiInputLabel-root': {
              fontSize: '0.8925rem',
            },
            '& .MuiOutlinedInput-input': {
              padding: '8px 12px',
            },
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: {
            fontSize: '0.8925rem',
          },
          input: {
            padding: '8px 12px',
          },
        },
      },
      MuiFormControl: {
        defaultProps: {
          size: 'small',
        },
        styleOverrides: {
          root: {
            '& .MuiInputLabel-root': {
              fontSize: '0.8925rem',
            },
          },
        },
      },
      MuiSelect: {
        defaultProps: {
          size: 'small',
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontSize: '0.8925rem',
          },
          select: {
            padding: '8px 12px',
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: '0.8925rem',
            padding: '8px 14px',
            minHeight: 36,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            padding: '10px 14px',
            fontSize: '0.84rem',
          },
          head: {
            fontWeight: 600,
            fontSize: '0.84rem',
            backgroundColor: '#f8fafc',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: 'rgba(0, 91, 150, 0.04)',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 10,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            boxShadow: '0 16px 48px rgba(0, 91, 150, 0.15)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: '1.155rem',
            fontWeight: 600,
            padding: '14px 18px',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            padding: '14px 18px',
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: '10px 18px 14px',
            gap: '8px',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 40,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40,
            padding: '8px 14px',
            fontSize: '0.84rem',
            textTransform: 'none',
            fontWeight: 500,
          },
        },
      },
      MuiListItem: {
        styleOverrides: {
          root: {
            paddingTop: 6,
            paddingBottom: 6,
          },
        },
      },
      MuiListItemText: {
        styleOverrides: {
          primary: {
            fontSize: '0.8925rem',
          },
          secondary: {
            fontSize: '0.7875rem',
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: {
            minWidth: 36,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: '0.735rem',
            padding: '4px 8px',
            borderRadius: 6,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: '0.84rem',
          },
        },
      },
      MuiSnackbar: {
        styleOverrides: {
          root: {
            '& .MuiAlert-root': {
              fontSize: '0.84rem',
            },
          },
        },
      },
      MuiBadge: {
        styleOverrides: {
          badge: {
            fontSize: '0.6825rem',
            minWidth: 16,
            height: 16,
            padding: '0 4px',
          },
        },
      },
      MuiStepper: {
        styleOverrides: {
          root: {
            padding: '16px 0',
          },
        },
      },
      MuiStepLabel: {
        styleOverrides: {
          label: {
            fontSize: '0.84rem',
          },
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&:before': {
              display: 'none',
            },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: {
            minHeight: 44,
            padding: '0 14px',
          },
          content: {
            margin: '10px 0',
          },
        },
      },
      MuiAccordionDetails: {
        styleOverrides: {
          root: {
            padding: '8px 14px 14px',
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(1, 31, 75, 0.5)',
          },
        },
      },
      MuiGrid: {
        styleOverrides: {
          root: {
            '& > .MuiGrid-item': {
              paddingTop: '12px',
              paddingLeft: '12px',
            },
          },
          container: {
            marginTop: '-12px',
            marginLeft: '-12px',
            width: 'calc(100% + 12px)',
          },
        },
      },
    },
  });
