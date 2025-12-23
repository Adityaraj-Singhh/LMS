import React, { useState, useEffect } from 'react';
import { Paper, Typography, Snackbar, Alert, CircularProgress, Box, Avatar } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import { getTeachers, addTeacher, bulkUploadTeachers, resetTeacherPassword, deactivateTeacher, activateTeacher, transferTeacher } from '../../api/teacherApi';
import AddTeacherForm from '../../components/admin/AddTeacherForm';
import BulkUploadTeachers from '../../components/admin/BulkUploadTeachers';
import TeacherTable from '../../components/admin/TeacherTable';
import ResetPasswordDialog from '../../components/admin/ResetPasswordDialog';
import EditTeacherDialog from '../../components/admin/EditTeacherDialog';

// Helper to check permission
function hasPermission(user, perm) {
  if (!user) return false;
  
  // Check if user has admin role in roles array (new format)
  if (user.roles && user.roles.includes('admin')) return true;
  
  // Check legacy role field
  if (user.role === 'admin') return true;
  
  // Check specific permissions
  if (Array.isArray(user.permissions) && (user.permissions.includes('*') || user.permissions.includes(perm))) return true;
  
  return false;
}

const TeacherManagement = ({ currentUser }) => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState('');
  const [resetDialog, setResetDialog] = useState({ open: false, teacherId: null });
  const [editDialog, setEditDialog] = useState({ open: false, teacher: null });
  const token = localStorage.getItem('token');

  const fetchTeachers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getTeachers(token);
      setTeachers(data);
    } catch (err) {
      setError('Failed to fetch teachers');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!hasPermission(currentUser, 'manage_teachers')) return;
    fetchTeachers();
    // eslint-disable-next-line
  }, [currentUser]);

  const handleAddTeacher = async (form) => {
    try {
      await addTeacher(form, token);
      setSnackbar('Teacher added successfully');
      fetchTeachers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add teacher');
    }
  };

  const handleBulkUpload = async (file) => {
    try {
      await bulkUploadTeachers(file, token);
      setSnackbar('Bulk upload successful');
      fetchTeachers();
    } catch (err) {
      setError(err.response?.data?.message || 'Bulk upload failed');
    }
  };

  const handleResetPassword = (teacherId) => {
    setResetDialog({ open: true, teacherId });
  };

  const handleResetPasswordSubmit = async (password) => {
    try {
      await resetTeacherPassword(resetDialog.teacherId, password, token);
      setSnackbar('Password reset successfully');
      setResetDialog({ open: false, teacherId: null });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password');
    }
  };

  const handleDeactivate = async (teacherId) => {
    try {
      await deactivateTeacher(teacherId, token);
      setSnackbar('Teacher deactivated');
      fetchTeachers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deactivate teacher');
    }
  };

  const handleActivate = async (teacherId) => {
    try {
      await activateTeacher(teacherId, token);
      setSnackbar('Teacher activated');
      fetchTeachers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to activate teacher');
    }
  };

  const handleEditTeacher = (teacher) => {
    setEditDialog({ open: true, teacher });
  };

  const handleTransferTeacher = async (transferData) => {
    try {
      await transferTeacher(editDialog.teacher._id, transferData, token);
      setSnackbar('Teacher transferred successfully');
      setEditDialog({ open: false, teacher: null });
      fetchTeachers();
    } catch (err) {
      throw err; // Let the dialog handle the error
    }
  };

  if (!hasPermission(currentUser, 'manage_teachers')) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" color="error">You do not have permission to manage teachers.</Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ p: 3, bgcolor: '#f5f7fa', minHeight: '100vh' }}>
      {/* Page Header */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 3, 
          mb: 3, 
          background: 'linear-gradient(135deg, #005b96 0%, #6497b1 100%)',
          borderRadius: 3,
          color: 'white'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
            <SchoolIcon sx={{ fontSize: 32 }} />
          </Avatar>
          <Box>
            <Typography 
              variant="h4" 
              component="h1"
              tabIndex={0}
              sx={{ 
                fontWeight: 700,
                outline: 'none',
                '&:focus, &:focus-visible': {
                  outline: '3px solid white',
                  borderRadius: 4,
                  outlineOffset: 4
                }
              }}
            >
              Teacher Management
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
              Add, manage, and organize teachers in the system
            </Typography>
          </Box>
        </Box>
      </Paper>
      
      <Paper sx={{ p: 3 }}>
      <AddTeacherForm onAdd={handleAddTeacher} />
      <BulkUploadTeachers onUpload={handleBulkUpload} />
      {loading ? <CircularProgress /> :
        <>
          <TeacherTable
            teachers={teachers}
            onResetPassword={handleResetPassword}
            onDeactivate={handleDeactivate}
            onActivate={handleActivate}
            onEditTeacher={handleEditTeacher}
          />
        </>
      }
      <ResetPasswordDialog
        open={resetDialog.open}
        onClose={() => setResetDialog({ open: false, teacherId: null })}
        onSubmit={handleResetPasswordSubmit}
      />
      <EditTeacherDialog
        open={editDialog.open}
        teacher={editDialog.teacher}
        onClose={() => setEditDialog({ open: false, teacher: null })}
        onSubmit={handleTransferTeacher}
      />
      <Snackbar 
        open={!!snackbar} 
        autoHideDuration={3000} 
        onClose={() => setSnackbar('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" onClose={() => setSnackbar('')}>{snackbar}</Alert>
      </Snackbar>
      {error && (
        <Snackbar 
          open={!!error} 
          autoHideDuration={6000} 
          onClose={() => setError('')}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
        </Snackbar>
      )}
      </Paper>
    </Box>
  );
};

export default TeacherManagement;
