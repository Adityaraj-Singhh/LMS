import React, { useEffect, useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardHeader,
  CardContent,
  Divider,
  IconButton,
  Tooltip,
  Chip,
  Avatar,
  TextField,
  InputAdornment,
  Stack,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import LockResetIcon from '@mui/icons-material/LockReset';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import HistoryIcon from '@mui/icons-material/History';
import axios from 'axios';
import { parseJwt } from '../../utils/jwt';

const UnlockRequests = () => {
  const token = localStorage.getItem('token');
  const currentUser = parseJwt(token);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [unlockNote, setUnlockNote] = useState('');

  const fetchData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/locks', { headers: { Authorization: `Bearer ${token}` } });
      setItems(res.data || []);
    } catch (err) {
      console.error('Failed to load locks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(it =>
      (it.student?.name || '').toLowerCase().includes(q) ||
      (it.student?.regNo || '').toLowerCase().includes(q) ||
      (it.course?.name || '').toLowerCase().includes(q) ||
      (it.unit?.title || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  const handleUnlock = async (studentId, courseId, unitId) => {
    try {
      await axios.post(`/api/admin/course/${courseId}/unit/${unitId}/unlock`, { studentId, note: unlockNote }, { headers: { Authorization: `Bearer ${token}` } });
      await fetchData();
      setUnlockNote('');
    } catch (err) {
      console.error('Unlock failed:', err);
    }
  };

  return (
    <Box sx={{ p: 3, bgcolor: '#f5f7fa', minHeight: '100vh' }}>
      {/* Page Header */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 3, 
          mb: 3, 
          background: 'linear-gradient(135deg, #6497b1 0%, #005b96 100%)',
          borderRadius: 3,
          color: 'white'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
              <LockOpenIcon sx={{ fontSize: 32 }} />
            </Avatar>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                Admin Quiz Unlock Dashboard
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
                Students with security-locked quizzes or who exhausted attempts without passing
              </Typography>
            </Box>
          </Box>
          <Box>
            <Tooltip title="Refresh">
              <IconButton 
                onClick={fetchData} 
                disabled={loading}
                sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
              >
                {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <RefreshIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      <Card elevation={2}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={2} alignItems="center">
            <TextField
              size="small"
              placeholder="Search by name, reg no, course, or unit"
              value={query}
              onChange={e => setQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              }}
              sx={{ maxWidth: 420, width: '100%' }}
            />
            <Chip label={`Total: ${items.length}`} />
          </Stack>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Student</TableCell>
                  <TableCell>Reg No</TableCell>
                  <TableCell>Course</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Violations</TableCell>
                  <TableCell>Attempts</TableCell>
                  <TableCell>Locked/Last Unlock</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((it, idx) => (
                  <TableRow key={idx} hover>
                    <TableCell>
                      {it.type === 'securityLock' ? (
                        <Chip size="small" color="error" label="Security Lock" />
                      ) : (
                        <Chip size="small" color="warning" label="Attempts Exhausted" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar sx={{ width: 28, height: 28 }}>{(it.student?.name || '?').slice(0,1)}</Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{it.student?.name || 'Unknown'}</Typography>
                          <Typography variant="caption" color="text.secondary">{it.student?.email}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>{it.student?.regNo || '-'}</TableCell>
                    <TableCell>{it.course?.name || '-'}</TableCell>
                    <TableCell>{it.unit?.title || '-'}</TableCell>
                    <TableCell>
                      <Chip size="small" color={it.type === 'securityLock' ? 'error' : 'warning'} variant="outlined" label={it.reason || '-'} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={it.violationCount >= 3 ? 'error' : 'default'} label={it.violationCount || 0} />
                    </TableCell>
                    <TableCell>
                      {it.type === 'attemptsExhausted' ? (
                        <Typography variant="body2">{it.attemptsTaken}/{it.attemptLimit}</Typography>
                      ) : (
                        <Typography variant="body2">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5}>
                        <Typography variant="body2">{it.lockedAt ? new Date(it.lockedAt).toLocaleString() : '-'}</Typography>
                        {Array.isArray(it.unlockHistory) && it.unlockHistory.length > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            Last unlock: {new Date(it.unlockHistory[it.unlockHistory.length - 1].unlockedAt).toLocaleString()}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Unlock / Manage">
                        <span>
                          {it.type === 'securityLock' ? (
                            <Button
                              size="small"
                              variant="contained"
                              color="primary"
                              startIcon={<LockResetIcon />}
                              onClick={() => handleUnlock(it.student?._id, it.course?._id, it.unit?._id)}
                            >
                              Unlock
                            </Button>
                          ) : (
                            <Button
                              size="small"
                              variant="contained"
                              color="secondary"
                              startIcon={<LockResetIcon />}
                              onClick={async () => {
                                try {
                                  await axios.post(`/api/admin/course/${it.course?._id}/unit/${it.unit?._id}/grant-attempts`, { studentId: it.student?._id, extraAttempts: 1 }, { headers: { Authorization: `Bearer ${token}` } });
                                  await fetchData();
                                } catch (err) {
                                  console.error('Grant attempts failed:', err);
                                }
                              }}
                            >
                              Unlock (1)
                            </Button>
                          )}
                          <IconButton size="small" sx={{ ml: 1 }} onClick={() => { setHistoryItem(it); setHistoryOpen(true); }}>
                            <HistoryIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary">No unlock requests.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* History Dialog */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Unlock History</DialogTitle>
        <DialogContent dividers>
          {historyItem ? (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {historyItem.student?.name} • {historyItem.course?.name} • {historyItem.unit?.title}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Locked At: {historyItem.lockedAt ? new Date(historyItem.lockedAt).toLocaleString() : '-'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Reason: {historyItem.reason || '-'}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" gutterBottom>History</Typography>
              {(historyItem.unlockHistory && historyItem.unlockHistory.length > 0) ? (
                <List dense>
                  {historyItem.unlockHistory.map((h, i) => (
                    <ListItem key={i}>
                      <ListItemText
                        primary={`Unlocked by ${h.unlockedBy?.name || 'Admin'} on ${new Date(h.unlockedAt).toLocaleString()}`}
                        secondary={h.note || ''}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">No unlock history.</Typography>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <TextField size="small" placeholder="Add unlock note" value={unlockNote} onChange={(e) => setUnlockNote(e.target.value)} sx={{ mr: 'auto' }} />
          <Button onClick={() => setHistoryOpen(false)}>Close</Button>
          {historyItem && historyItem.type === 'securityLock' && (
            <Button variant="contained" onClick={async () => {
              try {
                await handleUnlock(historyItem.student?._id, historyItem.course?._id, historyItem.unit?._id);
                setHistoryOpen(false);
              } catch {}
            }}>Unlock</Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UnlockRequests;
