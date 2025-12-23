import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  LinearProgress,
  Badge,
  CircularProgress,
  Tabs,
  Tab
} from '@mui/material';
import {
  VideoLibrary as VideoIcon,
  Description as DocumentIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Pending as PendingIcon,
  School as CourseIcon,
  Person as PersonIcon,
  Schedule as TimeIcon,
  Preview as PreviewIcon,
  CheckCircle
} from '@mui/icons-material';
import {
  getPendingArrangements,
  reviewArrangement,
  getContentArrangement
} from '../../api/contentArrangementApi';

const HODContentApproval = () => {
  const [tabValue, setTabValue] = useState(0);
  const [arrangements, setArrangements] = useState([]);
  const [approvedArrangements, setApprovedArrangements] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedArrangement, setSelectedArrangement] = useState(null);
  const [reviewDialog, setReviewDialog] = useState(false);
  const [reviewAction, setReviewAction] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [detailDialog, setDetailDialog] = useState(false);
  const [arrangementDetails, setArrangementDetails] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [previewDialog, setPreviewDialog] = useState(false);
  const [previewContent, setPreviewContent] = useState(null);
  const [launchDialog, setLaunchDialog] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchPendingArrangements();
    fetchApprovedArrangements();
  }, []);

  const fetchApprovedArrangements = async () => {
    try {
      const response = await fetch('/api/content-arrangement/approved', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        setApprovedArrangements(data.arrangements || []);
      } else {
        setError(data.message || 'Failed to load approved arrangements');
      }
    } catch (err) {
      setError('Failed to load approved arrangements');
    }
  };

  const fetchPendingArrangements = async () => {
    try {
      setLoading(true);
      const data = await getPendingArrangements(token);
      setArrangements(data.arrangements || []);
      setCourses(data.courses || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load pending arrangements');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async () => {
    if (!selectedArrangement || !reviewAction) return;

    try {
      setProcessing(true);
      await reviewArrangement(
        selectedArrangement._id,
        reviewAction,
        rejectionReason,
        token
      );
      
      const isLaunchedCourse = selectedArrangement.course.isLaunched;
      const successMessage = reviewAction === 'approve' 
        ? (isLaunchedCourse 
           ? 'Content update approved! Course is ready for re-launch.' 
           : 'Arrangement approved successfully! Course is ready to launch.')
        : `Arrangement ${reviewAction}d successfully`;
      
      setSuccess(successMessage);
      setReviewDialog(false);
      setSelectedArrangement(null);
      setRejectionReason('');
      await fetchPendingArrangements(); // Refresh the list
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${reviewAction} arrangement`);
    } finally {
      setProcessing(false);
    }
  };

  const handleViewDetails = async (arrangement) => {
    try {
      setLoading(true);
      // Get the full arrangement details with items and units
      const details = await getContentArrangement(arrangement.course._id, token);
      setArrangementDetails(details);
      setDetailDialog(true);
    } catch (err) {
      console.error('Error loading arrangement details:', err);
      setError('Failed to load arrangement details');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewContent = async (item) => {
    try {
      setLoading(true);
      
      // For videos, generate signed URL for preview
      if (item.type === 'video') {
        const response = await fetch(`/api/videos/${item.contentId}/signed-url`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        setPreviewContent({
          type: 'video',
          title: item.title,
          url: data.signedUrl
        });
        setPreviewDialog(true);
      }
      // For documents, generate signed URL for preview
      else if (item.type === 'document') {
        const response = await fetch(`/api/reading-materials/${item.contentId}/signed-url`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        setPreviewContent({
          type: 'document',
          title: item.title,
          url: data.signedUrl,
          contentType: data.contentType // Pass content type for proper rendering
        });
        setPreviewDialog(true);
      }
    } catch (err) {
      console.error('Error previewing content:', err);
      setError('Failed to preview content');
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchCourse = async () => {
    if (!selectedCourse) return;

    try {
      setProcessing(true);
      const response = await fetch(`/api/content-arrangement/course/${selectedCourse._id}/launch`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`Course "${selectedCourse.title}" launched successfully! Students can now access content.`);
        setLaunchDialog(false);
        setSelectedCourse(null);
        await fetchPendingArrangements(); // Refresh the lists
        await fetchApprovedArrangements();
      } else {
        setError(data.message || 'Failed to launch course');
      }
    } catch (err) {
      console.error('Error launching course:', err);
      setError('Failed to launch course');
    } finally {
      setProcessing(false);
    }
  };

  const openReviewDialog = (arrangement, action) => {
    setSelectedArrangement(arrangement);
    setReviewAction(action);
    setReviewDialog(true);
  };

  const getTimeSinceSubmission = (submittedAt) => {
    const now = new Date();
    const submitted = new Date(submittedAt);
    const diffHours = Math.floor((now - submitted) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${Math.floor(diffHours / 24)} days ago`;
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading pending arrangements...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container alignItems="center" justifyContent="space-between">
          <Grid item>
            <Typography variant="h5" gutterBottom>
              Content Approval & Course Launch
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review submitted arrangements and launch approved courses for students
            </Typography>
          </Grid>
          <Grid item>
            <Badge badgeContent={arrangements.length + approvedArrangements.length} color="primary">
              <PendingIcon sx={{ fontSize: 40 }} color="action" />
            </Badge>
          </Grid>
        </Grid>
      </Paper>

      {/* Status Messages */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {/* Tabs */}
      <Paper sx={{ width: '100%', mb: 2 }}>
        <Tabs 
          value={tabValue} 
          onChange={(e, newValue) => setTabValue(newValue)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            label={
              <Badge badgeContent={arrangements.length} color="warning" max={99}>
                Pending Approval
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={approvedArrangements.length} color="success" max={99}>
                Ready to Launch
              </Badge>
            } 
          />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {tabValue === 0 && (
        <>
          {/* Pending Arrangements */}
          {arrangements.length === 0 ? (
            <Card sx={{ textAlign: 'center', p: 4 }}>
              <CardContent>
                <PendingIcon sx={{ fontSize: 60, color: 'grey.400', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No Pending Arrangements
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  All content arrangements have been reviewed. New submissions will appear here.
                </Typography>
              </CardContent>
            </Card>
          ) : (
        <Grid container spacing={3}>
          {arrangements.map((arrangement) => (
            <Grid item xs={12} key={arrangement._id}>
              <Card sx={{ '&:hover': { boxShadow: 3 } }}>
                <CardContent>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={6}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <CourseIcon color="primary" />
                        <Typography variant="h6">
                          {arrangement.course.courseCode} - {arrangement.course.title}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <PersonIcon fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">
                            {arrangement.coordinator.name}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TimeIcon fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">
                            {getTimeSinceSubmission(arrangement.submittedAt)}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        Version {arrangement.version} • {arrangement.items?.length || 0} content items
                      </Typography>
                      {/* Course Launch Status */}
                      {arrangement.course.isLaunched && (
                        <Box sx={{ mt: 1, p: 1, bgcolor: 'primary.50', borderRadius: 1 }}>
                          <Typography variant="caption" color="primary.main">
                            📚 Course is Live • Content Update Request
                          </Typography>
                        </Box>
                      )}
                      {!arrangement.course.isLaunched && (
                        <Box sx={{ mt: 1, p: 1, bgcolor: 'info.50', borderRadius: 1 }}>
                          <Typography variant="caption" color="info.main">
                            🚀 New Course • Initial Content Arrangement
                          </Typography>
                        </Box>
                      )}
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Chip 
                        label={arrangement.course.isLaunched ? "CONTENT UPDATE" : "SUBMITTED"} 
                        color={arrangement.course.isLaunched ? "primary" : "warning"} 
                        variant="outlined"
                        sx={{ mb: 1 }}
                      />
                      <Typography variant="caption" display="block">
                        Submitted: {new Date(arrangement.submittedAt).toLocaleDateString()}
                      </Typography>
                      {arrangement.course.isLaunched && (
                        <Typography variant="caption" display="block" color="primary.main">
                          Update to live course
                        </Typography>
                      )}
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'row', md: 'column' } }}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleViewDetails(arrangement)}
                          fullWidth
                        >
                          View Details
                        </Button>
                        <Button
                          variant="contained"
                          color="success"
                          size="small"
                          startIcon={<ApproveIcon />}
                          onClick={() => openReviewDialog(arrangement, 'approve')}
                          fullWidth
                        >
                          {arrangement.course.isLaunched ? 'Approve Update' : 'Approve'}
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          startIcon={<RejectIcon />}
                          onClick={() => openReviewDialog(arrangement, 'reject')}
                          fullWidth
                        >
                          Reject
                        </Button>
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          onClick={() => {
                            setSelectedCourse(arrangement.course);
                            setLaunchDialog(true);
                          }}
                          fullWidth
                          sx={{ mt: 1 }}
                        >
                          🚀 Launch Course
                        </Button>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
        </>
      )}

      {tabValue === 1 && (
        <>
          {/* Approved Arrangements Ready to Launch */}
          {approvedArrangements.length === 0 ? (
            <Card sx={{ textAlign: 'center', p: 4 }}>
              <CardContent>
                <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No Courses Ready to Launch
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Approved content arrangements will appear here when ready for launch.
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Grid container spacing={3}>
              {approvedArrangements.map((arrangement) => (
                <Grid item xs={12} key={arrangement._id}>
                  <Card sx={{ '&:hover': { boxShadow: 3 }, border: '1px solid', borderColor: 'success.main' }}>
                    <CardContent>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={8}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <CheckCircle color="success" />
                            <Typography variant="h6">
                              {arrangement.course.courseCode} - {arrangement.course.title}
                            </Typography>
                            <Chip 
                              label="Approved" 
                              color="success" 
                              size="small" 
                            />
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <PersonIcon fontSize="small" color="action" />
                              <Typography variant="body2" color="text.secondary">
                                CC: {arrangement.coordinator?.name}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <TimeIcon fontSize="small" color="action" />
                              <Typography variant="body2" color="text.secondary">
                                Approved: {new Date(arrangement.approvedAt).toLocaleDateString()}
                              </Typography>
                            </Box>
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            Version {arrangement.version} • {arrangement.items?.length || 0} content items
                          </Typography>
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Button
                              variant="outlined"
                              color="info"
                              size="small"
                              startIcon={<PreviewIcon />}
                              onClick={() => openDetailDialog(arrangement)}
                              fullWidth
                            >
                              View Details
                            </Button>
                            <Button
                              variant="contained"
                              color="success"
                              size="small"
                              onClick={() => {
                                setSelectedCourse(arrangement.course);
                                setLaunchDialog(true);
                              }}
                              fullWidth
                            >
                              🚀 Launch Course
                            </Button>
                          </Box>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}

      {/* Review Dialog */}
      <Dialog open={reviewDialog} onClose={() => setReviewDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {reviewAction === 'approve' ? 'Approve Arrangement' : 'Reject Arrangement'}
        </DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Are you sure you want to <strong>{reviewAction}</strong> the content arrangement for{' '}
            <strong>{selectedArrangement?.course?.title}</strong>?
          </Typography>
          
          {reviewAction === 'approve' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Approving this arrangement will apply the new content sequence to the course. 
              This action cannot be undone.
            </Alert>
          )}
          
          {reviewAction === 'reject' && (
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Rejection Reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Please provide a reason for rejection..."
              sx={{ mt: 2 }}
              required
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleReview} 
            variant="contained"
            color={reviewAction === 'approve' ? 'success' : 'error'}
            disabled={processing || (reviewAction === 'reject' && !rejectionReason.trim())}
          >
            {processing ? 'Processing...' : reviewAction.charAt(0).toUpperCase() + reviewAction.slice(1)}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailDialog} onClose={() => setDetailDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Arrangement Details</DialogTitle>
        <DialogContent>
          {arrangementDetails && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Content Items ({arrangementDetails.arrangement?.items?.length || 0})
              </Typography>
              
              {/* Group items by unit */}
              {arrangementDetails.units?.map((unit) => {
                const unitItems = arrangementDetails.arrangement?.items?.filter(
                  item => item.unitId === unit._id
                ) || [];
                
                return (
                  <Accordion key={unit._id} defaultExpanded>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="subtitle1">
                        {unit.title} ({unitItems.length} items)
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <List dense>
                        {unitItems.map((item, index) => (
                          <React.Fragment key={`${item.contentId}-${item.type}`}>
                            <ListItem>
                              <ListItemIcon>
                                {item.type === 'video' ? <VideoIcon /> : <DocumentIcon />}
                              </ListItemIcon>
                              <ListItemText
                                primary={item.title}
                                secondary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Chip
                                      size="small"
                                      label={item.type}
                                      color={item.type === 'video' ? 'primary' : 'secondary'}
                                    />
                                    <Typography variant="caption">
                                      Order: {item.order}
                                    </Typography>
                                    {item.originalUnitId !== item.unitId && (
                                      <Chip
                                        size="small"
                                        label="Moved from another unit"
                                        color="warning"
                                        variant="outlined"
                                      />
                                    )}
                                  </Box>
                                }
                              />
                              <Button
                                size="small"
                                startIcon={<PreviewIcon />}
                                onClick={() => handlePreviewContent(item)}
                                sx={{ ml: 1 }}
                              >
                                Preview
                              </Button>
                            </ListItem>
                            {index < unitItems.length - 1 && <Divider />}
                          </React.Fragment>
                        ))}
                      </List>
                    </AccordionDetails>
                  </Accordion>
                );
              }) || (
                <Typography variant="body2" color="text.secondary">
                  No units available for this arrangement.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Content Preview Dialog */}
      <Dialog 
        open={previewDialog} 
        onClose={() => setPreviewDialog(false)} 
        maxWidth="lg" 
        fullWidth
        aria-labelledby="content-preview-title"
        aria-describedby="content-preview-description"
      >
        <DialogTitle id="content-preview-title">
          Content Preview - {previewContent?.title}
        </DialogTitle>
        <DialogContent id="content-preview-description">
          {previewContent?.type === 'video' && (
            <Box sx={{ width: '100%', height: '500px' }}>
              <video
                controls
                style={{ width: '100%', height: '100%' }}
                controlsList="nodownload"
                onContextMenu={(e) => e.preventDefault()}
              >
                <source src={previewContent.url} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </Box>
          )}
          {previewContent?.type === 'document' && (
            <Box sx={{ width: '100%', height: '600px' }}>
              {previewContent.contentType === 'pdf' || previewContent.url?.includes('.pdf') ? (
                // PDF files can be displayed directly
                <iframe
                  src={previewContent.url}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    borderRadius: '4px'
                  }}
                  title={previewContent.title}
                />
              ) : (
                // For DOCX, PPT, XLS use Microsoft Office Online Viewer (like FlipBook)
                <iframe
                  src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewContent.url)}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    borderRadius: '4px'
                  }}
                  title={previewContent.title}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Launch Course Dialog */}
      <Dialog open={launchDialog} onClose={() => setLaunchDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>🚀 Launch Course for Students</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Are you sure you want to launch <strong>{selectedCourse?.title}</strong> for students?
          </Typography>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            <strong>After launching:</strong>
            <ul style={{ marginBottom: 0 }}>
              <li>Students will be able to see and access all course content</li>
              <li>Videos and documents will be playable/viewable by students</li>
              <li>The approved content sequence will be live</li>
            </ul>
          </Alert>
          
          <Alert severity="warning" sx={{ mt: 2 }}>
            Make sure you have reviewed and approved the content arrangement before launching!
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLaunchDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleLaunchCourse} 
            variant="contained"
            color="primary"
            disabled={processing}
            startIcon={processing ? <CircularProgress size={20} /> : null}
          >
            {processing ? 'Launching...' : '🚀 Launch Course'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HODContentApproval;