import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  Fab,
  Slide,
  Avatar,
  Chip,
  Button,
  Tooltip,
  Zoom,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  Chat as ChatIcon,
  Close as CloseIcon,
  Send as SendIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  NavigateNext as NavigateIcon,
  Lightbulb as TipIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { findMatchingGuide, quickSuggestions, guides, getWorkflowResponse } from '../../data/chatbotGuides';

const HelpChatbot = ({ userRole = 'student' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Load chat history from localStorage
  useEffect(() => {
    const savedMessages = localStorage.getItem('lms_chatbot_messages');
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        // Only load if not too old (24 hours)
        if (parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          setMessages(parsed.messages || []);
        }
      } catch (e) {
        console.error('Error loading chat history:', e);
      }
    }
  }, []);

  // Save chat history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('lms_chatbot_messages', JSON.stringify({
        messages,
        timestamp: Date.now(),
      }));
    }
  }, [messages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Add welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage = {
        type: 'bot',
        content: {
          type: 'greeting',
          message: `Hello! 👋 I'm your LMS assistant. I can help you navigate the system and guide you through various tasks. What would you like to do?`,
          suggestions: quickSuggestions[userRole] || quickSuggestions.student,
        },
        timestamp: Date.now(),
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, messages.length, userRole]);

  const simulateTyping = (callback, delay = 800) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      callback();
    }, delay + Math.random() * 500); // Add some randomness for natural feel
  };

  const handleSendMessage = (text = inputValue) => {
    if (!text.trim()) return;

    // Add user message
    const userMessage = {
      type: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    // Find matching guide and respond
    simulateTyping(() => {
      const result = findMatchingGuide(text, userRole, { currentPath: location.pathname });
      const botMessage = {
        type: 'bot',
        content: result,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, botMessage]);
    }, text.length * 20 + 500); // Vary delay based on input length
  };

  const handleSuggestionClick = (intent) => {
    if (intent === 'roleFirstSteps') {
      const workflowContent = getWorkflowResponse(userRole, { currentPath: location.pathname });
      const roleLabel = workflowContent?.workflow?.roleLabel || 'User';
      const userMessage = {
        type: 'user',
        content: `What should I do first as a ${roleLabel}?`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMessage]);
      simulateTyping(() => {
        const botMessage = {
          type: 'bot',
          content: workflowContent,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, botMessage]);
      });
      return;
    }

    const guide = guides[intent];
    if (guide) {
      // Add user message showing what they clicked
      const userMessage = {
        type: 'user',
        content: guide.title.replace(/[📚👥🔗👨‍🏫🎓📤🎬📄📝📖📊🔓📢🏫🏢▶️🏆]/g, '').trim(),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMessage]);

      // Respond with the guide
      simulateTyping(() => {
        const botMessage = {
          type: 'bot',
          content: {
            type: 'guide',
            guide: { key: intent, ...guide },
          },
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, botMessage]);
      });
    }
  };

  const handleNavigate = (path) => {
    navigate(path);
    // Optionally close chatbot after navigation
    // setIsOpen(false);
  };

  const handleClearChat = () => {
    setMessages([]);
    localStorage.removeItem('lms_chatbot_messages');
    // Add fresh welcome message
    setTimeout(() => {
      const welcomeMessage = {
        type: 'bot',
        content: {
          type: 'greeting',
          message: `Chat cleared! 🔄 How can I help you today?`,
          suggestions: quickSuggestions[userRole] || quickSuggestions.student,
        },
        timestamp: Date.now(),
      };
      setMessages([welcomeMessage]);
    }, 300);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const renderBotMessage = (content) => {
    if (content.type === 'greeting' || content.type === 'fallback') {
      return (
        <Box>
          <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6 }}>
            {content.message}
          </Typography>
          {content.suggestions && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {content.suggestions.map((suggestion, idx) => (
                <Chip
                  key={idx}
                  label={suggestion.label}
                  size="small"
                  onClick={() => handleSuggestionClick(suggestion.intent)}
                  sx={{
                    cursor: 'pointer',
                    bgcolor: '#e3f2fd',
                    color: '#1565c0',
                    '&:hover': { bgcolor: '#bbdefb' },
                    fontWeight: 500,
                  }}
                />
              ))}
            </Box>
          )}
        </Box>
      );
    }

    if (content.type === 'guide') {
      const guide = content.guide;
      return (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#1565c0' }}>
            {guide.title}
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            {guide.description}
          </Typography>
          
          {/* Steps */}
          <Box sx={{ mb: 2 }}>
            {guide.steps.map((step, idx) => (
              <Box
                key={idx}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  mb: 1.5,
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: idx % 2 === 0 ? '#f8f9fa' : '#fff',
                  border: '1px solid #e0e0e0',
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: '#e3f2fd',
                    borderColor: '#90caf9',
                  },
                }}
              >
                <Avatar
                  sx={{
                    width: 28,
                    height: 28,
                    bgcolor: '#1565c0',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                  }}
                >
                  {idx + 1}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {step.icon} {step.label}
                    </Typography>
                    {step.path && (
                      <Tooltip title="Go to this page">
                        <IconButton
                          size="small"
                          onClick={() => handleNavigate(step.path)}
                          sx={{
                            color: '#1565c0',
                            bgcolor: '#e3f2fd',
                            '&:hover': { bgcolor: '#bbdefb' },
                            width: 24,
                            height: 24,
                          }}
                        >
                          <NavigateIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {step.description}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Tips */}
          {guide.tips && guide.tips.length > 0 && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: '#fff8e1',
                border: '1px solid #ffecb3',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#f57c00', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <TipIcon sx={{ fontSize: 16 }} /> Tips
              </Typography>
              {guide.tips.map((tip, idx) => (
                <Typography key={idx} variant="caption" sx={{ display: 'block', color: '#795548' }}>
                  • {tip}
                </Typography>
              ))}
            </Box>
          )}

          {/* Quick suggestions for next action */}
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #e0e0e0' }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Need help with something else?
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {(quickSuggestions[userRole] || quickSuggestions.student).slice(0, 3).map((suggestion, idx) => (
                <Chip
                  key={idx}
                  label={suggestion.label}
                  size="small"
                  variant="outlined"
                  onClick={() => handleSuggestionClick(suggestion.intent)}
                  sx={{
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    height: 24,
                    '&:hover': { bgcolor: '#e3f2fd' },
                  }}
                />
              ))}
            </Box>
          </Box>
        </Box>
      );
    }

    if (content.type === 'workflow') {
      const { workflow, suggestions } = content;
      const renderSection = (title, items = []) => {
        if (!items || items.length === 0) return null;
        return (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#005b96' }}>
              {title}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {items.map((item, idx) => (
                <Box
                  key={`${item.label}-${idx}`}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid #e0e0e0',
                    bgcolor: '#f8f9fa',
                    display: 'flex',
                    gap: 1.5,
                  }}
                >
                  <Avatar
                    sx={{
                      width: 28,
                      height: 28,
                      bgcolor: '#005b96',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    {item.icon || '•'}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.label}
                      </Typography>
                      {item.path && (
                        <Tooltip title="Go to this area">
                          <IconButton
                            size="small"
                            onClick={() => handleNavigate(item.path)}
                            sx={{
                              color: '#1565c0',
                              bgcolor: '#e3f2fd',
                              '&:hover': { bgcolor: '#bbdefb' },
                              width: 24,
                              height: 24,
                            }}
                          >
                            <NavigateIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {item.description}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        );
      };

      return (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#0b3d91' }}>
            {workflow.title}
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            {workflow.description}
          </Typography>

          {renderSection('✅ Check these first', workflow.preChecks)}
          {renderSection('🚀 Start with these steps', workflow.primaryActions)}
          {renderSection('📈 After that', workflow.followUps)}

          {workflow.tips && workflow.tips.length > 0 && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: '#fff8e1',
                border: '1px solid #ffecb3',
                mb: 2,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#f57c00', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <TipIcon sx={{ fontSize: 16 }} /> Pro Tips
              </Typography>
              {workflow.tips.map((tip, idx) => (
                <Typography key={idx} variant="caption" sx={{ display: 'block', color: '#795548' }}>
                  • {tip}
                </Typography>
              ))}
            </Box>
          )}

          {suggestions && suggestions.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Need to continue?
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {suggestions.slice(1, 4).map((suggestion, idx) => (
                  <Chip
                    key={`${suggestion.intent}-${idx}`}
                    label={suggestion.label}
                    size="small"
                    variant="outlined"
                    onClick={() => handleSuggestionClick(suggestion.intent)}
                    sx={{
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      height: 24,
                      '&:hover': { bgcolor: '#e3f2fd' },
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      );
    }

    return <Typography variant="body2">{JSON.stringify(content)}</Typography>;
  };

  return (
    <>
      {/* Chat FAB Button */}
      <Zoom in={!isOpen}>
        <Fab
          color="primary"
          onClick={() => setIsOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1200,
            background: 'linear-gradient(135deg, #005b96 0%, #6497b1 100%)',
            boxShadow: '0 4px 20px rgba(0,91,150,0.4)',
            '&:hover': {
              background: 'linear-gradient(135deg, #004a7c 0%, #5386a0 100%)',
              transform: 'scale(1.05)',
            },
            transition: 'all 0.3s ease',
          }}
        >
          <ChatIcon />
        </Fab>
      </Zoom>

      {/* Chat Window */}
      <Slide direction="up" in={isOpen} mountOnEnter unmountOnExit>
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: { xs: 'calc(100vw - 48px)', sm: 380 },
            maxWidth: 420,
            height: { xs: 'calc(100vh - 120px)', sm: 520 },
            maxHeight: 600,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1300,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              background: 'linear-gradient(135deg, #005b96 0%, #6497b1 100%)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 40, height: 40 }}>
                <BotIcon />
              </Avatar>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  LMS Assistant
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  Here to help you navigate
                </Typography>
              </Box>
            </Box>
            <Box>
              <Tooltip title="Clear chat">
                <IconButton size="small" onClick={handleClearChat} sx={{ color: 'white', mr: 0.5 }}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close">
                <IconButton size="small" onClick={() => setIsOpen(false)} sx={{ color: 'white' }}>
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Messages */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 2,
              bgcolor: '#f5f7fa',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {messages.map((message, idx) => (
              <Box
                key={idx}
                sx={{
                  display: 'flex',
                  justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
                  gap: 1,
                }}
              >
                {message.type === 'bot' && (
                  <Avatar sx={{ width: 32, height: 32, bgcolor: '#1565c0' }}>
                    <BotIcon sx={{ fontSize: 18 }} />
                  </Avatar>
                )}
                <Paper
                  elevation={1}
                  sx={{
                    p: 1.5,
                    maxWidth: '85%',
                    borderRadius: 2,
                    bgcolor: message.type === 'user' ? '#1565c0' : 'white',
                    color: message.type === 'user' ? 'white' : 'inherit',
                    borderTopLeftRadius: message.type === 'bot' ? 0 : 16,
                    borderTopRightRadius: message.type === 'user' ? 0 : 16,
                  }}
                >
                  {message.type === 'user' ? (
                    <Typography variant="body2">{message.content}</Typography>
                  ) : (
                    renderBotMessage(message.content)
                  )}
                </Paper>
                {message.type === 'user' && (
                  <Avatar sx={{ width: 32, height: 32, bgcolor: '#37474f' }}>
                    <PersonIcon sx={{ fontSize: 18 }} />
                  </Avatar>
                )}
              </Box>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: '#1565c0' }}>
                  <BotIcon sx={{ fontSize: 18 }} />
                </Avatar>
                <Paper
                  elevation={1}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'white',
                    borderTopLeftRadius: 0,
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <CircularProgress size={8} sx={{ color: '#1565c0' }} />
                    <CircularProgress size={8} sx={{ color: '#1565c0', animationDelay: '0.2s' }} />
                    <CircularProgress size={8} sx={{ color: '#1565c0', animationDelay: '0.4s' }} />
                  </Box>
                </Paper>
              </Box>
            )}

            <div ref={messagesEndRef} />
          </Box>

          {/* Input */}
          <Box
            sx={{
              p: 2,
              bgcolor: 'white',
              borderTop: '1px solid #e0e0e0',
              display: 'flex',
              gap: 1,
            }}
          >
            <TextField
              inputRef={inputRef}
              fullWidth
              size="small"
              placeholder="Ask me anything..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isTyping}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 3,
                  bgcolor: '#f5f7fa',
                },
              }}
            />
            <IconButton
              color="primary"
              onClick={() => handleSendMessage()}
              disabled={!inputValue.trim() || isTyping}
              sx={{
                bgcolor: '#1565c0',
                color: 'white',
                '&:hover': { bgcolor: '#0d47a1' },
                '&:disabled': { bgcolor: '#e0e0e0', color: '#9e9e9e' },
              }}
            >
              <SendIcon />
            </IconButton>
          </Box>
        </Paper>
      </Slide>
    </>
  );
};

export default HelpChatbot;
