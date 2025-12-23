import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  Typography,
  Alert,
  Paper,
  Container
} from '@mui/material';
import axios from 'axios';

/**
 * SSO Login Page
 * Handles Single Sign-On redirects from UMS (University Management System)
 * 
 * Flow:
 * 1. User clicks "Access LMS" in UMS
 * 2. UMS generates SSO token and redirects here with ?token=xxx
 * 3. This page sends token to backend for verification
 * 4. Backend creates/fetches LMS user and returns LMS JWT token
 * 5. User is redirected to their dashboard
 */
const SSOLogin = () => {
  const [status, setStatus] = useState('Authenticating...');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double processing in strict mode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const authenticateSSO = async () => {
      try {
        // Get SSO token from URL
        const params = new URLSearchParams(location.search);
        const ssoToken = params.get('token');

        if (!ssoToken) {
          setError('No authentication token provided. Please login from UMS.');
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        setStatus('Verifying credentials...');

        // Get API URL from environment
        const apiUrl = process.env.REACT_APP_API_URL || '/api';

        // Send SSO token to LMS backend for verification
        const response = await axios.post(`${apiUrl}/auth/sso-login`, { 
          ssoToken 
        }, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });

        if (!response.data.success) {
          throw new Error(response.data.message || 'SSO authentication failed');
        }

        const { token, user } = response.data;

        setStatus('Setting up your session...');

        // Clear any existing auth data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('activeRole');

        // Store new token and user data
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('activeRole', user.primaryRole || user.role);

        // Dispatch auth event for other components
        window.dispatchEvent(new CustomEvent('auth:user-changed', { 
          detail: { user, source: 'sso' } 
        }));

        setStatus('Success! Redirecting to dashboard...');

        // Determine redirect route based on role
        const roleRoutes = {
          admin: '/admin/dashboard',
          dean: '/dean/dashboard',
          hod: '/hod/dashboard',
          teacher: '/teacher/dashboard',
          student: '/student/dashboard'
        };

        const userRole = user.primaryRole || user.role;
        const redirectRoute = roleRoutes[userRole] || '/login';

        console.log('✅ SSO Login successful:', user.email, 'Role:', userRole);

        // Short delay before redirect for better UX
        setTimeout(() => {
          navigate(redirectRoute, { replace: true });
        }, 1000);

      } catch (err) {
        console.error('❌ SSO authentication error:', err);
        
        let errorMessage = 'SSO authentication failed. Please try again.';
        
        if (err.response?.data?.message) {
          errorMessage = err.response.data.message;
        } else if (err.message) {
          errorMessage = err.message;
        }

        setError(errorMessage);
        
        // Redirect to login page after showing error
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 4000);
      }
    };

    authenticateSSO();
  }, [location, navigate]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 50%, #0d47a1 100%)'
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={8}
          sx={{
            p: 5,
            textAlign: 'center',
            borderRadius: 3
          }}
        >
          {error ? (
            <>
              <Alert 
                severity="error" 
                sx={{ 
                  mb: 3, 
                  textAlign: 'left',
                  '& .MuiAlert-message': { width: '100%' }
                }}
              >
                <Typography variant="subtitle2" fontWeight={600}>
                  Authentication Failed
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {error}
                </Typography>
              </Alert>
              <Typography variant="body2" color="text.secondary">
                Redirecting to login page...
              </Typography>
              <CircularProgress size={24} sx={{ mt: 2 }} />
            </>
          ) : (
            <>
              <CircularProgress 
                size={60} 
                thickness={4}
                sx={{ mb: 3 }} 
              />
              <Typography 
                variant="h5" 
                fontWeight={600}
                gutterBottom
              >
                Single Sign-On
              </Typography>
              <Typography 
                variant="body1" 
                color="text.secondary"
                sx={{ mb: 2 }}
              >
                {status}
              </Typography>
              <Typography 
                variant="body2" 
                color="text.secondary"
              >
                Please wait while we authenticate your session from UMS
              </Typography>
            </>
          )}
        </Paper>

        <Typography 
          variant="body2" 
          sx={{ 
            mt: 3, 
            color: 'rgba(255,255,255,0.8)',
            textAlign: 'center'
          }}
        >
          SGT Learning Management System
        </Typography>
      </Container>
    </Box>
  );
};

export default SSOLogin;
