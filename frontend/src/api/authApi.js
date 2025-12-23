import axiosConfig from '../utils/axiosConfig';

// Get user profile information
export const getUserProfile = async (token) => {
  try {
    const response = await axiosConfig.get('/auth/profile', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};

// Alternative method to get current user info from token
export const getCurrentUser = () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    
    // Decode JWT token to get user info (basic implementation)
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      regNo: payload.regNo || payload.studentId,
      role: payload.role
    };
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};