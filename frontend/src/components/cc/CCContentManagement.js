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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip,
  Grid,
  Card,
  CardContent,
  Divider,
  LinearProgress
} from '@mui/material';
import {
  VideoLibrary as VideoIcon,
  Description as DocumentIcon,
  ExpandMore as ExpandMoreIcon,
  DragIndicator as DragIcon,
  Send as SubmitIcon,
  History as HistoryIcon,
  CheckCircle as ApprovedIcon,
  Pending as PendingIcon,
  Edit as EditIcon,
  Preview as PreviewIcon
} from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import {
  getContentArrangement,
  updateContentArrangement,
  submitArrangement,
  getArrangementHistory
} from '../../api/contentArrangementApi';

const CCContentManagement = ({ courseId, courseName }) => {
  const [arrangement, setArrangement] = useState(null);
  const [units, setUnits] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [historyDialog, setHistoryDialog] = useState(false);
  const [history, setHistory] = useState([]);
  const [submitDialog, setSubmitDialog] = useState(false);
  const [previewDialog, setPreviewDialog] = useState(false);
  const [previewContent, setPreviewContent] = useState(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (courseId) {
      fetchContentArrangement();
    }
  }, [courseId]);

  const fetchContentArrangement = async () => {
    try {
      setLoading(true);
      const data = await getContentArrangement(courseId, token);
      
      // Check if the course is locked
      if (data.isLocked) {
        setError('Course arrangement is approved and locked. Wait for new content to be added before making changes.');
        setArrangement(data.arrangement);
        setUnits(data.units || []);
        setItems([]);
        return;
      }
      
      setArrangement(data.arrangement);
      setUnits(data.units);
      setItems(data.arrangement.items || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load content arrangement');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const data = await getArrangementHistory(courseId, token);
      setHistory(data);
    } catch (err) {
      setError('Failed to load arrangement history');
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);

    // Update orders
    const updatedItems = newItems.map((item, index) => ({
      ...item,
      order: index + 1
    }));

    setItems(updatedItems);
    saveArrangement(updatedItems);
  };

  const moveToUnit = (itemIndex, targetUnitId) => {
    const newItems = [...items];
    newItems[itemIndex] = {
      ...newItems[itemIndex],
      unitId: targetUnitId
    };
    setItems(newItems);
    saveArrangement(newItems);
  };

  const saveArrangement = async (newItems) => {
    if (!arrangement || arrangement.status !== 'open') return;

    try {
      setSaving(true);
      await updateContentArrangement(arrangement._id, newItems, token);
      setSuccess('Arrangement saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save arrangement');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      await submitArrangement(arrangement._id, token);
      setSuccess('Arrangement submitted for HOD approval');
      setSubmitDialog(false);
      await fetchContentArrangement(); // Refresh to get updated status
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit arrangement');
    } finally {
      setSaving(false);
    }
  };

  const handleHistoryClick = async () => {
    await fetchHistory();
    setHistoryDialog(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'warning';
      case 'submitted': return 'info';
      case 'approved': return 'success';
      case 'rejected': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved': return <ApprovedIcon />;
      case 'submitted': return <PendingIcon />;
      default: return <EditIcon />;
    }
  };

  const handlePreviewContent = async (item) => {
    const token = localStorage.getItem('token');
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

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading content arrangement...</Typography>
      </Box>
    );
  }

  if (!arrangement) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">No content arrangement found for this course.</Alert>
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
              Content Arrangement - {courseName}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip 
                icon={getStatusIcon(arrangement.status)}
                label={arrangement.status.toUpperCase()} 
                color={getStatusColor(arrangement.status)}
                size="small"
              />
              <Typography variant="body2" color="text.secondary">
                Version {arrangement.version}
              </Typography>
            </Box>
          </Grid>
          <Grid item>
            <Button
              startIcon={<HistoryIcon />}
              onClick={handleHistoryClick}
              variant="outlined"
              sx={{ mr: 1 }}
            >
              History
            </Button>
            {arrangement.status === 'open' && (
              <Button
                startIcon={<SubmitIcon />}
                onClick={() => setSubmitDialog(true)}
                variant="contained"
                disabled={saving}
              >
                Submit for Approval
              </Button>
            )}
          </Grid>
        </Grid>
      </Paper>

      {/* Status Messages */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {saving && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
          <Typography variant="body2" align="center" sx={{ mt: 1 }}>
            Saving changes...
          </Typography>
        </Box>
      )}

      {/* Advanced Workflow Status Messages */}
      {arrangement.course?.isLaunched && !arrangement.course?.hasNewContent && arrangement.status === 'approved' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body1">
            <strong>Course is Live</strong> - This course is currently launched and serving students. 
            Content arrangement is locked until new content is added by the admin.
          </Typography>
        </Alert>
      )}
      
      {arrangement.course?.hasNewContent && arrangement.status !== 'open' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body1">
            <strong>New Content Available</strong> - Admin has added new content to this course. 
            You can now create a new arrangement to include the new content.
          </Typography>
        </Alert>
      )}

      {arrangement.course?.hasNewContent && arrangement.status === 'open' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body1">
            <strong>Updating Course Content</strong> - You are currently arranging new content for this launched course. 
            Students will continue to see the current content until HOD approves and launches the new arrangement.
          </Typography>
        </Alert>
      )}

      {arrangement.course?.hasNewContent && arrangement.status === 'pending' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body1">
            <strong>Awaiting HOD Approval</strong> - Your updated arrangement with new content has been submitted. 
            Students will see the updated content after HOD approval and course re-launch.
          </Typography>
        </Alert>
      )}

      {/* Instructions */}
      {arrangement.status === 'open' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>Instructions:</strong> Drag and drop content items to rearrange them within or between units. 
            Changes are saved automatically. Click "Submit for Approval" when you're ready for HOD review.
          </Typography>
        </Alert>
      )}

      {arrangement.status !== 'open' && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2">
            This arrangement is <strong>{arrangement.status}</strong> and cannot be edited.
            {arrangement.status === 'submitted' && ' Waiting for HOD approval.'}
            {arrangement.status === 'approved' && ' This arrangement has been approved and is now active.'}
          </Typography>
        </Alert>
      )}

      {/* Content Arrangement */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="content-list">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              {/* Group items by unit */}
              {units.map((unit) => {
                const unitItems = items.filter(item => item.unitId === unit._id);
                return (
                  <Accordion key={unit._id} defaultExpanded sx={{ mb: 2 }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="h6">
                        {unit.title} ({unitItems.length} items)
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <List>
                        {unitItems.map((item, index) => {
                          const globalIndex = items.findIndex(i => i === item);
                          return (
                            <Draggable
                              key={`${item.contentId}-${item.type}`}
                              draggableId={`${item.contentId}-${item.type}`}
                              index={globalIndex}
                              isDragDisabled={arrangement.status !== 'open'}
                            >
                              {(provided, snapshot) => (
                                <ListItem
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  sx={{
                                    mb: 1,
                                    bgcolor: snapshot.isDragging ? 'grey.100' : 'white',
                                    border: '1px solid',
                                    borderColor: snapshot.isDragging ? 'primary.main' : 'grey.300',
                                    borderRadius: 1,
                                    '&:hover': {
                                      bgcolor: 'grey.50'
                                    }
                                  }}
                                >
                                  <ListItemIcon {...provided.dragHandleProps}>
                                    {arrangement.status === 'open' ? (
                                      <DragIcon color="action" />
                                    ) : (
                                      item.type === 'video' ? <VideoIcon /> : <DocumentIcon />
                                    )}
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
                                            label="Moved"
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
                                    sx={{ mr: 1 }}
                                  >
                                    Preview
                                  </Button>
                                  {arrangement.status === 'open' && (
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                      {/* Unit move buttons */}
                                      {units.filter(u => u._id !== unit._id).map(targetUnit => (
                                        <Tooltip key={targetUnit._id} title={`Move to ${targetUnit.title}`}>
                                          <Button
                                            size="small"
                                            onClick={() => moveToUnit(globalIndex, targetUnit._id)}
                                            sx={{ minWidth: 'auto', px: 1 }}
                                          >
                                            → {targetUnit.title.substring(0, 10)}
                                          </Button>
                                        </Tooltip>
                                      ))}
                                    </Box>
                                  )}
                                </ListItem>
                              )}
                            </Draggable>
                          );
                        })}
                      </List>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Submit Confirmation Dialog */}
      <Dialog open={submitDialog} onClose={() => setSubmitDialog(false)}>
        <DialogTitle>Submit Arrangement for Approval</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to submit this content arrangement for HOD approval? 
            Once submitted, you won't be able to make further changes until it's reviewed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmitDialog(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving}>
            {saving ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialog} onClose={() => setHistoryDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Arrangement History</DialogTitle>
        <DialogContent>
          <List>
            {history.map((h, index) => (
              <React.Fragment key={h._id}>
                <ListItem>
                  <ListItemText
                    primary={`Version ${h.version}`}
                    secondary={
                      <Box>
                        <Typography variant="body2">
                          Status: <Chip size="small" label={h.status} color={getStatusColor(h.status)} />
                        </Typography>
                        <Typography variant="caption" display="block">
                          Created: {new Date(h.createdAt).toLocaleString()}
                        </Typography>
                        {h.submittedAt && (
                          <Typography variant="caption" display="block">
                            Submitted: {new Date(h.submittedAt).toLocaleString()}
                          </Typography>
                        )}
                        {h.approvedAt && (
                          <Typography variant="caption" display="block">
                            Approved: {new Date(h.approvedAt).toLocaleString()}
                          </Typography>
                        )}
                        {h.rejectedAt && (
                          <Typography variant="caption" display="block" color="error">
                            Rejected: {new Date(h.rejectedAt).toLocaleString()}
                            {h.rejectionReason && ` - ${h.rejectionReason}`}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
                {index < history.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialog(false)}>Close</Button>
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
    </Box>
  );
};

export default CCContentManagement;