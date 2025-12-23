import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  LinearProgress,
  Chip,
  Button,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Collapse
} from '@mui/material';
import {
  Warning as WarningIcon,
  VideoLibrary as VideoIcon,
  Description as DocumentIcon,
  CheckCircle as CompletedIcon,
  Lock as BlockedIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  PlayArrow as PlayIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { 
  getUnitsNeedingReview, 
  getProgressionStatus,
  checkUnitCompletion 
} from '../../api/unitValidationApi';

const StudentProgressValidation = ({ courseId, courseName, onProgressUpdate }) => {
  const [unitsNeedingReview, setUnitsNeedingReview] = useState([]);
  const [progressionStatus, setProgressionStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedUnits, setExpandedUnits] = useState({});
  const [detailDialog, setDetailDialog] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (courseId) {
      fetchValidationData();
    }
  }, [courseId]);

  const fetchValidationData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const [unitsData, statusData] = await Promise.all([
        getUnitsNeedingReview(courseId, token),
        getProgressionStatus(courseId, token)
      ]);

      setUnitsNeedingReview(unitsData.unitsNeedingReview || []);
      setProgressionStatus(statusData);
    } catch (err) {
      console.error('Error fetching validation data:', err);
      setError('Failed to load progress validation information');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshProgress = async () => {
    try {
      setRefreshing(true);
      await fetchValidationData();
      if (onProgressUpdate) {
        onProgressUpdate();
      }
    } catch (err) {
      console.error('Error refreshing progress:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCheckUnitCompletion = async (unitId) => {
    try {
      const result = await checkUnitCompletion(courseId, unitId, token);
      
      if (result.success && result.reason === 'unit_revalidated') {
        // Refresh data after successful completion
        await fetchValidationData();
        if (onProgressUpdate) {
          onProgressUpdate();
        }
      }
    } catch (err) {
      console.error('Error checking unit completion:', err);
    }
  };

  const toggleUnitExpansion = (unitId) => {
    setExpandedUnits(prev => ({
      ...prev,
      [unitId]: !prev[unitId]
    }));
  };

  const openUnitDetails = (unit) => {
    setSelectedUnit(unit);
    setDetailDialog(true);
  };

  const getCompletionColor = (percentage) => {
    if (percentage === 100) return 'success';
    if (percentage >= 50) return 'warning';
    return 'error';
  };

  const getStatusChip = (status) => {
    switch (status) {
      case 'needs_review':
        return <Chip icon={<WarningIcon />} label="Needs Review" color="warning" size="small" />;
      case 'completed':
        return <Chip icon={<CompletedIcon />} label="Completed" color="success" size="small" />;
      case 'in-progress':
        return <Chip icon={<PlayIcon />} label="In Progress" color="primary" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LinearProgress />
          <Typography align="center" sx={{ mt: 2 }}>
            Loading progress validation...
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // Show nothing if no validation issues
  if (!progressionStatus?.isBlocked && unitsNeedingReview.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mb: 3 }}>
      {/* Main Alert */}
      {progressionStatus?.isBlocked && (
        <Alert 
          severity="warning" 
          sx={{ mb: 2 }}
          action={
            <IconButton
              color="inherit"
              size="small"
              onClick={handleRefreshProgress}
              disabled={refreshing}
            >
              <RefreshIcon />
            </IconButton>
          }
        >
          <Typography variant="body1" fontWeight="medium">
            📚 Content Update Required
          </Typography>
          <Typography variant="body2">
            New content has been added to units you've completed. You must complete this new content before progressing further.
          </Typography>
        </Alert>
      )}

      {/* Units Needing Review */}
      {unitsNeedingReview.length > 0 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" color="warning.main">
                Units Requiring Attention ({unitsNeedingReview.length})
              </Typography>
              <Button
                startIcon={<RefreshIcon />}
                onClick={handleRefreshProgress}
                disabled={refreshing}
                size="small"
              >
                Refresh Status
              </Button>
            </Box>

            {unitsNeedingReview.map((unit) => (
              <Card key={unit.unitId} variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Grid container alignItems="center" spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography variant="h6">
                          Unit {unit.unitOrder}: {unit.unitTitle}
                        </Typography>
                        {getStatusChip(unit.status)}
                      </Box>
                      
                      {/* Progress Bar */}
                      {unit.completion?.hasNewRequirements && (
                        <Box sx={{ mb: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              New Content Progress
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {unit.completion.completedItems}/{unit.completion.totalNewItems} completed
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={unit.completion.completionPercentage || 0}
                            color={getCompletionColor(unit.completion.completionPercentage || 0)}
                            sx={{ height: 8, borderRadius: 1 }}
                          />
                        </Box>
                      )}
                    </Grid>
                    
                    <Grid item xs={12} md={3}>
                      <Typography variant="body2" color="text.secondary">
                        New Content:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {unit.newContent.videos.length > 0 && (
                          <Chip 
                            icon={<VideoIcon />} 
                            label={`${unit.newContent.videos.length} videos`} 
                            size="small" 
                            color="primary" 
                          />
                        )}
                        {unit.newContent.documents.length > 0 && (
                          <Chip 
                            icon={<DocumentIcon />} 
                            label={`${unit.newContent.documents.length} docs`} 
                            size="small" 
                            color="secondary" 
                          />
                        )}
                      </Box>
                    </Grid>
                    
                    <Grid item xs={12} md={3}>
                      <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                        <Button
                          size="small"
                          onClick={() => openUnitDetails(unit)}
                          variant="outlined"
                        >
                          View Details
                        </Button>
                        <Button
                          size="small"
                          startIcon={expandedUnits[unit.unitId] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          onClick={() => toggleUnitExpansion(unit.unitId)}
                        >
                          {expandedUnits[unit.unitId] ? 'Hide' : 'Show'} Content
                        </Button>
                      </Box>
                    </Grid>
                  </Grid>

                  {/* Expandable Content List */}
                  <Collapse in={expandedUnits[unit.unitId]}>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      New Content to Complete:
                    </Typography>
                    
                    <List dense>
                      {unit.newContent.videos.map((video) => (
                        <ListItem key={video._id}>
                          <ListItemIcon>
                            <VideoIcon color="primary" />
                          </ListItemIcon>
                          <ListItemText
                            primary={video.title}
                            secondary={`Duration: ${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')}`}
                          />
                          <Chip 
                            label={unit.completion?.incompleteItems?.find(item => item.id === video._id) ? 'Required' : 'Completed'} 
                            size="small"
                            color={unit.completion?.incompleteItems?.find(item => item.id === video._id) ? 'error' : 'success'}
                          />
                        </ListItem>
                      ))}
                      
                      {unit.newContent.documents.map((doc) => (
                        <ListItem key={doc._id}>
                          <ListItemIcon>
                            <DocumentIcon color="secondary" />
                          </ListItemIcon>
                          <ListItemText
                            primary={doc.title}
                            secondary="Reading Material"
                          />
                          <Chip 
                            label={unit.completion?.incompleteItems?.find(item => item.id === doc._id) ? 'Required' : 'Completed'} 
                            size="small"
                            color={unit.completion?.incompleteItems?.find(item => item.id === doc._id) ? 'error' : 'success'}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Progression Blocking Info */}
      {progressionStatus?.isBlocked && progressionStatus.totalBlockedProgression > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <BlockedIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
            <strong>{progressionStatus.totalBlockedProgression}</strong> subsequent units are temporarily blocked until you complete the required content above.
          </Typography>
        </Alert>
      )}

      {/* Unit Details Dialog */}
      <Dialog 
        open={detailDialog} 
        onClose={() => setDetailDialog(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          {selectedUnit && `Unit ${selectedUnit.unitOrder}: ${selectedUnit.unitTitle}`}
        </DialogTitle>
        <DialogContent>
          {selectedUnit && (
            <Box>
              <Typography variant="body1" color="text.secondary" paragraph>
                This unit has new content that must be completed to continue your course progression.
              </Typography>
              
              {selectedUnit.completion?.hasNewRequirements && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Completion Progress
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={selectedUnit.completion.completionPercentage || 0}
                    color={getCompletionColor(selectedUnit.completion.completionPercentage || 0)}
                    sx={{ height: 10, borderRadius: 1, mb: 1 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {selectedUnit.completion.completedItems} of {selectedUnit.completion.totalNewItems} items completed
                  </Typography>
                </Box>
              )}

              <Typography variant="h6" gutterBottom>
                Required Content
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="primary" gutterBottom>
                    📹 New Videos ({selectedUnit.newContent.videos.length})
                  </Typography>
                  <List dense>
                    {selectedUnit.newContent.videos.map((video) => (
                      <ListItem key={video._id}>
                        <ListItemText
                          primary={video.title}
                          secondary={`${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="secondary" gutterBottom>
                    📄 New Documents ({selectedUnit.newContent.documents.length})
                  </Typography>
                  <List dense>
                    {selectedUnit.newContent.documents.map((doc) => (
                      <ListItem key={doc._id}>
                        <ListItemText
                          primary={doc.title}
                          secondary="Reading Material"
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog(false)}>Close</Button>
          <Button 
            variant="contained" 
            onClick={() => {
              setDetailDialog(false);
              // Navigate to unit content
              window.location.href = `/course/${courseId}/unit/${selectedUnit?.unitId}`;
            }}
          >
            Start Learning
          </Button>
        </DialogActions>
      </Dialog>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default StudentProgressValidation;