/**
 * Security utilities for quiz environment validation
 */

/**
 * Attempts to disable Chrome extensions by opening quiz in incognito-like mode
 * @returns {Promise<boolean>} Success status
 */
export const disableBrowserExtensions = async () => {
  try {
    // Method 1: Request to open in incognito mode (extensions disabled by default)
    if (navigator.userAgent.includes('Chrome')) {
      // Create a link to open current page in incognito mode
      const currentUrl = window.location.href;
      const incognitoUrl = `chrome://incognito/${currentUrl}`;
      
      // Try to detect if we're already in incognito mode
      const isIncognito = await detectIncognitoMode();
      
      if (!isIncognito) {
        // Show warning about extensions
        console.warn('🔒 Extensions may be active. For maximum security, please:');
        console.warn('1. Open quiz in Incognito/Private mode');
        console.warn('2. Or disable all extensions manually');
        
        return false;
      }
    }
    
    // Method 2: Detect and warn about active extensions
    const extensionCheck = detectChromeExtensions();
    if (extensionCheck.detected.length > 0) {
      console.warn('🚨 Browser extensions detected:', extensionCheck.detected);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Extension disable check failed:', error);
    return false;
  }
};

/**
 * Detects if browser is in incognito/private mode
 * @returns {Promise<boolean>} True if in incognito mode
 */
export const detectIncognitoMode = () => {
  return new Promise((resolve) => {
    // Chrome detection
    if (navigator.userAgent.includes('Chrome')) {
      const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
      if (fs) {
        fs(window.TEMPORARY, 100, resolve.bind(null, false), resolve.bind(null, true));
      } else {
        resolve(false);
      }
    }
    // Firefox detection
    else if (navigator.userAgent.includes('Firefox')) {
      const db = indexedDB.open('test');
      db.onerror = () => resolve(true);
      db.onsuccess = () => resolve(false);
    }
    // Safari detection
    else if (navigator.userAgent.includes('Safari')) {
      try {
        localStorage.setItem('test', '1');
        localStorage.removeItem('test');
        resolve(false);
      } catch (e) {
        resolve(true);
      }
    } else {
      resolve(false);
    }
  });
};

/**
 * Detects remote connection software and screen sharing applications
 * @returns {Object} Detection results
 */
export const detectRemoteConnections = () => {
  const detectedRemoteApps = [];
  const suspiciousActivity = [];
  
  try {
    // Method 1: Check for remote desktop software indicators
    const remoteDesktopIndicators = [
      // TeamViewer detection
      () => {
        return document.title.includes('TeamViewer') ||
               window.location.href.includes('teamviewer') ||
               document.querySelector('[class*="teamviewer"]') ||
               document.querySelector('[id*="teamviewer"]') ||
               navigator.userAgent.includes('TeamViewer');
      },
      
      // AnyDesk detection
      () => {
        return document.title.includes('AnyDesk') ||
               window.location.href.includes('anydesk') ||
               document.querySelector('[class*="anydesk"]') ||
               document.querySelector('[id*="anydesk"]') ||
               navigator.userAgent.includes('AnyDesk');
      },
      
      // Chrome Remote Desktop detection
      () => {
        return document.title.includes('Chrome Remote Desktop') ||
               window.location.href.includes('remotedesktop.google.com') ||
               document.querySelector('[class*="remote-desktop"]') ||
               document.querySelector('[aria-label*="remote"]');
      },
      
      // Windows RDP detection
      () => {
        return navigator.userAgent.includes('Remote Desktop') ||
               document.title.includes('Remote Desktop Connection') ||
               window.screen.width === 1024 && window.screen.height === 768; // Common RDP resolution
      },
      
      // VNC detection
      () => {
        return document.title.includes('VNC') ||
               window.location.href.includes('vnc') ||
               navigator.userAgent.includes('VNC') ||
               document.querySelector('[class*="vnc"]');
      },
      
      // Generic remote session detection
      () => {
        const suspiciousPatterns = ['remote', 'desktop', 'viewer', 'session', 'share', 'connect'];
        const title = document.title.toLowerCase();
        const url = window.location.href.toLowerCase();
        
        return suspiciousPatterns.some(pattern => 
          title.includes(pattern) || url.includes(pattern)
        );
      }
    ];
    
    remoteDesktopIndicators.forEach((test, index) => {
      try {
        if (test()) {
          detectedRemoteApps.push({
            type: 'remote-desktop',
            method: `detection-method-${index + 1}`,
            confidence: 'high',
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.warn(`Remote desktop detection method ${index + 1} failed:`, error);
      }
    });
    
    // Method 2: Check for screen sharing indicators
    const screenSharingChecks = [
      // Check if screen is being captured
      () => {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          // This is indirect - we can't directly detect if screen is being shared
          // But we can check for suspicious screen dimensions
          const ratio = window.screen.width / window.screen.height;
          return ratio < 1.2 || ratio > 2.5; // Unusual aspect ratios might indicate sharing
        }
        return false;
      },
      
      // Check for multiple monitor setup (common in remote scenarios)
      () => {
        return window.screen.availWidth !== window.screen.width ||
               window.screen.availHeight !== window.screen.height;
      },
      
      // Check for virtualized environment indicators
      () => {
        const userAgent = navigator.userAgent;
        const virtualizedIndicators = [
          'VirtualBox', 'VMware', 'QEMU', 'Xen', 'Hyper-V', 
          'Parallels', 'VirtualPC', 'Docker'
        ];
        return virtualizedIndicators.some(indicator => userAgent.includes(indicator));
      }
    ];
    
    screenSharingChecks.forEach((test, index) => {
      try {
        if (test()) {
          suspiciousActivity.push({
            type: 'screen-sharing-indicator',
            method: `sharing-detection-${index + 1}`,
            confidence: 'medium',
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.warn(`Screen sharing detection method ${index + 1} failed:`, error);
      }
    });
    
    // Method 3: Performance-based detection
    const performanceIndicators = () => {
      const start = performance.now();
      for (let i = 0; i < 100000; i++) {
        Math.random();
      }
      const end = performance.now();
      const executionTime = end - start;
      
      // If execution is unusually slow, might indicate remote session
      return executionTime > 50; // Threshold for suspicious performance
    };
    
    if (performanceIndicators()) {
      suspiciousActivity.push({
        type: 'performance-degradation',
        method: 'execution-time-test',
        confidence: 'low',
        timestamp: new Date()
      });
    }
    
  } catch (error) {
    console.error('Remote connection detection failed:', error);
  }
  
  return {
    remoteDesktopDetected: detectedRemoteApps.length > 0,
    screenSharingPossible: suspiciousActivity.length > 0,
    detectedRemoteApps,
    suspiciousActivity,
    confidence: detectedRemoteApps.length > 0 ? 'high' : 
                suspiciousActivity.length > 0 ? 'medium' : 'low'
  };
};

/**
 * Detects if Chrome extensions are active by checking for common extension artifacts
 * @returns {Object} Detection results
 */
export const detectChromeExtensions = () => {
  const detectedExtensions = [];
  const warnings = [];
  const blockedExtensions = []; // Extensions that must be disabled for quiz security
  
  try {
    // Method 1: Detect problematic extensions that interfere with focus/tab detection
    const problematicExtensions = [
      {
        name: 'Always Active Window',
        indicators: [
          () => window.alwaysActiveWindow !== undefined,
          () => document.querySelector('[data-extension="always-active-window"]'),
          () => window.navigator.userAgent.includes('AlwaysActiveWindow'),
          () => {
            // Test if window focus events are being artificially triggered
            let focusCount = 0;
            const testHandler = () => focusCount++;
            window.addEventListener('focus', testHandler);
            window.dispatchEvent(new Event('blur'));
            window.dispatchEvent(new Event('focus'));
            window.removeEventListener('focus', testHandler);
            return focusCount > 1; // Abnormal focus event behavior
          },
          () => {
            // Check for Always Active Window specific DOM elements
            const elements = document.querySelectorAll('*');
            for (let el of elements) {
              if (el.id && el.id.toLowerCase().includes('always') && el.id.toLowerCase().includes('active')) {
                return true;
              }
              if (el.className && el.className.toLowerCase().includes('always-active')) {
                return true;
              }
            }
            return false;
          },
          () => {
            // Check for modified setTimeout/setInterval behavior
            const originalSetTimeout = window.setTimeout.toString();
            const originalSetInterval = window.setInterval.toString();
            return !originalSetTimeout.includes('[native code]') || 
                   !originalSetInterval.toString().includes('[native code]') ||
                   originalSetTimeout.includes('active') ||
                   originalSetInterval.includes('active');
          },
          () => {
            // Test if page visibility API is being overridden
            try {
              const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
              return descriptor && descriptor.get && !descriptor.get.toString().includes('[native code]');
            } catch (e) {
              return false;
            }
          },
          () => {
            // Direct Always Active Window behavior test
            const directTest = directAlwaysActiveWindowTest();
            return directTest.detected && directTest.confidence !== 'low';
          }
        ],
        severity: 'CRITICAL',
        reason: 'Prevents proper tab switching and window focus detection during quiz'
      },
      {
        name: 'Stay Alive',
        indicators: [
          () => window.stayAlive !== undefined,
          () => document.querySelector('[id*="stay-alive"]'),
          () => window.setInterval.toString().includes('stayalive')
        ],
        severity: 'CRITICAL', 
        reason: 'Keeps tabs artificially active, interfering with quiz monitoring'
      },
      {
        name: 'Tab Suspender Blockers',
        indicators: [
          () => window.noSleep !== undefined,
          () => document.querySelector('[class*="nosleep"]'),
          () => window.navigator.wakeLock !== undefined
        ],
        severity: 'HIGH',
        reason: 'May interfere with proper tab activity detection'
      }
    ];

    // Check for each problematic extension
    problematicExtensions.forEach(ext => {
      const detected = ext.indicators.some(indicator => {
        try {
          return indicator();
        } catch (e) {
          return false;
        }
      });
      
      if (detected) {
        detectedExtensions.push(`${ext.name} (${ext.severity} RISK)`);
        blockedExtensions.push({
          name: ext.name,
          severity: ext.severity,
          reason: ext.reason
        });
        warnings.push(`${ext.name} detected - this extension MUST be disabled to take the quiz`);
      }
    });

    // Method 2: Check for modified global objects commonly used by extensions
    const globalChecks = [
      'webkitNotifications',
      'chrome.runtime', 
      'chrome.storage',
      'chrome.tabs',
      'chrome.webRequest'
    ];
    
    globalChecks.forEach(prop => {
      const obj = prop.includes('.') ? 
        prop.split('.').reduce((o, p) => o && o[p], window) : 
        window[prop];
      if (obj) {
        detectedExtensions.push(`Global object detected: ${prop}`);
      }
    });

    // Method 2: Check for extension-injected script tags
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
      if (script.src && script.src.includes('chrome-extension://')) {
        detectedExtensions.push(`Extension script: ${script.src.substring(0, 50)}...`);
      }
    });

    // Method 3: Check for extension-injected DOM elements
    const extensionElements = document.querySelectorAll('[id*="extension"], [class*="extension"], [data-extension]');
    if (extensionElements.length > 0) {
      detectedExtensions.push(`Extension DOM elements: ${extensionElements.length} found`);
    }

    // Method 4: Test for focus/visibility API manipulation
    const focusManipulationTest = () => {
      // Test if document.hidden and document.visibilityState are being manipulated
      const originalHidden = document.hidden;
      const originalVisibilityState = document.visibilityState;
      
      // Simulate tab switch
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      
      // Check if values are being overridden
      const isManipulated = (document.hidden === false || document.visibilityState === 'visible');
      
      // Restore original values
      Object.defineProperty(document, 'hidden', { value: originalHidden, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: originalVisibilityState, configurable: true });
      
      return isManipulated;
    };

    if (focusManipulationTest()) {
      detectedExtensions.push('Focus/Visibility API manipulation detected');
      blockedExtensions.push({
        name: 'Focus Manipulation Extension',
        severity: 'CRITICAL',
        reason: 'Prevents detection of tab switching and window minimizing'
      });
      warnings.push('Extension detected that manipulates window focus - MUST be disabled');
    }

    // Method 5: Check for common ad blocker/security extension artifacts
    const adBlockerTests = [
      () => {
        const testAd = document.createElement('div');
        testAd.innerHTML = '&nbsp;';
        testAd.className = 'adsbox';
        testAd.style.position = 'absolute';
        testAd.style.left = '-10000px';
        document.body.appendChild(testAd);
        const blocked = testAd.offsetHeight === 0;
        document.body.removeChild(testAd);
        return blocked;
      }
    ];

    adBlockerTests.forEach((test, index) => {
      try {
        if (test()) {
          detectedExtensions.push(`Ad blocker detected (test ${index + 1})`);
        }
      } catch (e) {
        // Ignore test errors
      }
    });

    // Method 6: Check for developer tools extensions
    const devToolsCheck = () => {
      const threshold = 160;
      return window.outerHeight - window.innerHeight > threshold ||
             window.outerWidth - window.innerWidth > threshold;
    };

    if (devToolsCheck()) {
      detectedExtensions.push('Developer tools or extensions affecting window size');
    }

    // Method 7: Check for content script modifications
    const originalConsole = console;
    if (originalConsole.log.toString().includes('native code') === false) {
      detectedExtensions.push('Console object has been modified (possible extension)');
    }

    // Generate warnings based on detections
    if (detectedExtensions.length > 0) {
      warnings.push('Browser extensions detected that may interfere with quiz security');
      warnings.push('Please disable all extensions and refresh the page before starting');
    }

    // Add specific warnings for blocked extensions
    if (blockedExtensions.length > 0) {
      warnings.push('CRITICAL: Extensions detected that MUST be disabled:');
      blockedExtensions.forEach(ext => {
        warnings.push(`• ${ext.name}: ${ext.reason}`);
      });
      warnings.push('Quiz access will be BLOCKED until these extensions are disabled');
    }

    return {
      extensionsDetected: detectedExtensions.length > 0,
      count: detectedExtensions.length,
      details: detectedExtensions,
      warnings: warnings,
      blockedExtensions: blockedExtensions,
      canProceedToQuiz: blockedExtensions.length === 0, // Block quiz if critical extensions detected
      riskLevel: blockedExtensions.length > 0 ? 'critical' : 
                detectedExtensions.length > 3 ? 'high' : 
                detectedExtensions.length > 1 ? 'medium' : 
                detectedExtensions.length > 0 ? 'low' : 'none'
    };

  } catch (error) {
    console.error('Extension detection failed:', error);
    return {
      extensionsDetected: false,
      count: 0,
      details: [],
      warnings: ['Unable to verify extension status'],
      riskLevel: 'unknown'
    };
  }
};

/**
 * Validates the browser environment for quiz security
 * @returns {Object} Environment validation results
 */
export const validateBrowserEnvironment = () => {
  const issues = [];
  const recommendations = [];

  try {
    // Check if running in incognito/private mode
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(estimate => {
        if (estimate.quota < 120000000) { // Less than ~120MB suggests incognito
          issues.push('Browser appears to be in private/incognito mode');
          recommendations.push('Use regular browsing mode for better security validation');
        }
      });
    }

    // Check for automation tools
    if (navigator.webdriver) {
      issues.push('Automated browser detected (WebDriver)');
      recommendations.push('Use a regular browser without automation tools');
    }

    // Check for unusual navigator properties
    const suspiciousProps = [
      'phantom', 'callPhantom', '__phantomas', '_phantom',
      'Buffer', 'emit', 'spawn'
    ];

    suspiciousProps.forEach(prop => {
      if (window[prop] || navigator[prop]) {
        issues.push(`Suspicious property detected: ${prop}`);
        recommendations.push('Browser environment may be compromised');
      }
    });

    // Check screen resolution (very small resolutions might indicate automation)
    // Allow mobile devices - only flag very small screens that suggest automation/bots
    // Mobile phones typically have screen.width of 360-428 and screen.height of 640-926
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = /iPad|Android/i.test(navigator.userAgent) && !/Mobile/i.test(navigator.userAgent);
    
    // Only flag as suspicious if it's not a mobile device AND resolution is very small
    if (!isMobileDevice && !isTablet && (screen.width < 320 || screen.height < 240)) {
      issues.push('Unusually small screen resolution detected');
      recommendations.push('Use a standard screen resolution');
    }

    // Check for headless browser indicators
    if (navigator.userAgent.includes('HeadlessChrome') || 
        navigator.userAgent.includes('PhantomJS') ||
        window.outerWidth === 0 || window.outerHeight === 0) {
      issues.push('Headless browser detected');
      recommendations.push('Use a regular browser with GUI');
    }

    // Check timezone
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!timezone || timezone === 'UTC') {
        issues.push('Unusual timezone settings detected');
      }
    } catch (e) {
      issues.push('Unable to verify timezone settings');
    }

    return {
      isValid: issues.length === 0,
      issues: issues,
      recommendations: recommendations,
      riskLevel: issues.length > 2 ? 'high' : 
                issues.length > 0 ? 'medium' : 'low'
    };

  } catch (error) {
    console.error('Browser environment validation failed:', error);
    return {
      isValid: false,
      issues: ['Browser environment validation failed'],
      recommendations: ['Please use a supported browser'],
      riskLevel: 'high'
    };
  }
};

/**
 * Creates a security report combining all checks
 * @returns {Promise<Object>} Complete security assessment
 */
export const createSecurityReport = async () => {
  const extensionCheck = detectChromeExtensions();
  const environmentCheck = validateBrowserEnvironment();
  const realTimeTest = await performRealTimeTabSwitchTest();
  const directTest = directAlwaysActiveWindowTest();
  
  // If direct test shows high confidence detection, add it as a blocked extension
  if (directTest.detected && (directTest.confidence === 'high' || directTest.confidence === 'very-high')) {
    extensionCheck.blockedExtensions.push({
      name: 'Always Active Window (Direct Detection)',
      severity: 'CRITICAL',
      reason: 'Direct behavioral test confirmed extension interference',
      evidence: directTest.evidence,
      confidence: directTest.confidence
    });
    extensionCheck.warnings.push('CRITICAL: Always Active Window extension detected via direct testing');
    extensionCheck.riskLevel = 'critical';
    extensionCheck.canProceedToQuiz = false;
  }
  
  // If real-time test shows interference, add it as a blocked extension
  if (realTimeTest.extensionInterference) {
    extensionCheck.blockedExtensions.push({
      name: 'Tab Switching Interference Extension',
      severity: 'CRITICAL',
      reason: 'Real-time test detected extension interference with tab switching detection'
    });
    extensionCheck.warnings.push('CRITICAL: Real-time test detected extension interference');
    extensionCheck.riskLevel = 'critical';
    extensionCheck.canProceedToQuiz = false;
  }
  
  const overallRisk = extensionCheck.riskLevel === 'critical' ? 'critical' :
    [extensionCheck.riskLevel, environmentCheck.riskLevel]
    .includes('high') ? 'high' : 
    [extensionCheck.riskLevel, environmentCheck.riskLevel]
    .includes('medium') ? 'medium' : 'low';

  const canProceed = extensionCheck.canProceedToQuiz && 
                    environmentCheck.isValid && 
                    overallRisk !== 'critical' &&
                    realTimeTest.overallWorking &&
                    !(directTest.detected && directTest.confidence !== 'low');

  return {
    timestamp: new Date().toISOString(),
    extensions: extensionCheck,
    environment: environmentCheck,
    realTimeTest: realTimeTest,
    directTest: directTest,
    overallRisk: overallRisk,
    blockedExtensions: extensionCheck.blockedExtensions || [],
    canProceed: canProceed,
    blockingReason: !canProceed ? (
      extensionCheck.blockedExtensions?.length > 0 ? 
      'Critical extensions detected that prevent quiz security' :
      realTimeTest.extensionInterference ?
      'Real-time test detected tab switching interference' :
      directTest.detected ?
      'Direct test detected Always Active Window extension' :
      'Environment validation failed'
    ) : null,
    recommendations: [
      ...extensionCheck.warnings,
      ...environmentCheck.recommendations,
      ...(realTimeTest.extensionInterference ? [
        'Disable browser extensions that interfere with tab switching detection',
        'Common problematic extensions: Always Active Window, Stay Alive, NoSleep'
      ] : []),
      ...(directTest.detected && directTest.confidence !== 'low' ? [
        'Always Active Window extension detected - MUST be disabled',
        'Go to Chrome Extensions (chrome://extensions/) and disable Always Active Window',
        'Refresh this page after disabling the extension'
      ] : [])
    ]
  };
};

/**
 * Continuously monitors for extension activity during quiz
 * @param {Function} onViolation Callback when violation detected
 * @returns {Function} Cleanup function
 */
export const startSecurityMonitoring = (onViolation) => {
  const violations = [];
  
  // Monitor for new script injections
  const scriptObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.tagName === 'SCRIPT' && node.src && 
            node.src.includes('chrome-extension://')) {
          const violation = {
            type: 'script_injection',
            details: 'Extension script injected during quiz',
            timestamp: new Date().toISOString()
          };
          violations.push(violation);
          onViolation(violation);
        }
      });
    });
  });

  scriptObserver.observe(document.head, { childList: true, subtree: true });
  scriptObserver.observe(document.body, { childList: true, subtree: true });

  // Monitor for DOM modifications that might indicate extension activity
  const domObserver = new MutationObserver((mutations) => {
    let suspiciousChanges = 0;
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && ( // Element node
              node.className?.includes('extension') ||
              node.id?.includes('extension') ||
              node.getAttribute?.('data-extension')
            )) {
            suspiciousChanges++;
          }
        });
      }
    });

    if (suspiciousChanges > 2) {
      const violation = {
        type: 'dom_manipulation',
        details: `Suspicious DOM changes detected: ${suspiciousChanges}`,
        timestamp: new Date().toISOString()
      };
      violations.push(violation);
      onViolation(violation);
    }
  });

  domObserver.observe(document.body, { 
    childList: true, 
    subtree: true, 
    attributes: true,
    attributeFilter: ['class', 'id', 'data-extension']
  });

  // Cleanup function
  return () => {
    scriptObserver.disconnect();
    domObserver.disconnect();
    return violations;
  };
};

/**
 * Bypass-resistant tab switching detection that works even with Always Active Window extension
 * Uses multiple detection methods that are harder for extensions to block
 * @param {Function} onTabSwitch Callback when tab switch is detected
 * @returns {Function} Cleanup function
 */
export const startBypassResistantTabDetection = (onTabSwitch) => {
  const detectionMethods = [];
  let isActive = true;
  let lastActiveTime = Date.now();
  let activityCheckInterval;
  let mouseMovementTimeout;
  let keyboardActivityTimeout;
  // Pending candidate detections: require corroboration before treating as real
  const pendingDetections = [];
  const CORROBORATION_WINDOW = 800; // ms
  
  // **FIX: Add startup grace period - don't detect anything for first 3 seconds**
  const startTime = Date.now();
  const STARTUP_GRACE_PERIOD = 8000; // 8 seconds grace period on startup (increased from 3)
  
  // **FIX: Track if we're in fullscreen to avoid false positives during transitions**
  let isInFullscreen = !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
  
  // Listen for fullscreen changes to update our state
  const handleFullscreenChange = () => {
    const wasInFullscreen = isInFullscreen;
    isInFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    
    // If fullscreen state changed, give a grace period before detecting again
    if (wasInFullscreen !== isInFullscreen) {
      console.log('🔄 Fullscreen state changed in bypass detection, pausing for 2s');
      lastActiveTime = Date.now() + 2000; // Extend grace
    }
  };
  
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  
  // Method 1: Mouse movement tracking
  let mouseMovementDetected = false;
  const mouseHandler = (e) => {
    mouseMovementDetected = true;
    lastActiveTime = Date.now();
    clearTimeout(mouseMovementTimeout);
    mouseMovementTimeout = setTimeout(() => {
      mouseMovementDetected = false;
    }, 2000);
  };
  
  // Method 2: Enhanced keyboard activity tracking with system key detection
  let keyboardActivityDetected = false;
  let altPressed = false;
  let winPressed = false;
  
  const keyboardHandler = (event) => {
    // Ignore synthetic events
    if (event && event.isTrusted === false) return;
    keyboardActivityDetected = true;
    lastActiveTime = Date.now();
    
    // Detect system navigation keys
    const key = event.key;
    const keyCode = event.keyCode || event.which;
    const isKeyDown = event.type === 'keydown';
    
    // Track Alt key state
    if (key === 'Alt' || keyCode === 18) {
      altPressed = isKeyDown;
      if (isKeyDown) {
        console.log('🔍 Alt key detected - monitoring for Alt+Tab');
      }
    }
    
    // Track Windows/Meta key state
    if (key === 'Meta' || key === 'OS' || keyCode === 91 || keyCode === 92) {
      winPressed = isKeyDown;
      if (isKeyDown) {
        console.log('🔍 Windows key detected - monitoring for system navigation');
        // Windows key press often indicates system navigation
        setTimeout(() => {
          if (document.hidden || !document.hasFocus()) {
            console.log('🚨 Windows key navigation detected');
            onTabSwitch({
              method: 'windows-key-navigation',
              evidence: 'Windows key pressed followed by focus loss',
              confidence: 'high'
            });
          }
        }, 100);
      }
    }
    
    // Detect Alt+Tab combination
    if (altPressed && key === 'Tab') {
      console.log('🚨 Alt+Tab candidate detected');
      event.preventDefault(); // still try to prevent
      recordCandidateDetection({
        method: 'alt-tab-detected',
        evidence: 'Alt+Tab key combination pressed',
        confidence: 'very-high'
      });
      return false;
    }
    
    // Detect other suspicious key combinations
    if (event.ctrlKey && event.shiftKey && key === 'Tab') {
      console.log('🚨 Ctrl+Shift+Tab detected!');
      event.preventDefault();
      onTabSwitch({
        method: 'ctrl-shift-tab',
        evidence: 'Ctrl+Shift+Tab key combination pressed',
        confidence: 'very-high'
      });
      return false;
    }
    
    // Detect F11 (fullscreen toggle)
    if (key === 'F11' || keyCode === 122) {
      console.log('🚨 F11 (fullscreen toggle) candidate detected');
      setTimeout(() => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && 
            !document.mozFullScreenElement && !document.msFullscreenElement) {
          recordCandidateDetection({
            method: 'fullscreen-exit',
            evidence: 'F11 pressed - exited fullscreen mode',
            confidence: 'high'
          });
        }
      }, 100);
    }
    
    // Detect Escape in fullscreen (potential exit attempt)
    if (key === 'Escape' && (document.fullscreenElement || document.webkitFullscreenElement || 
                             document.mozFullScreenElement || document.msFullscreenElement)) {
      console.log('🚨 Escape in fullscreen candidate detected');
      setTimeout(() => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && 
            !document.mozFullScreenElement && !document.msFullscreenElement) {
          recordCandidateDetection({
            method: 'escape-fullscreen-exit',
            evidence: 'Escape pressed - exited fullscreen mode',
            confidence: 'high'
          });
        }
      }, 100);
    }
    
    clearTimeout(keyboardActivityTimeout);
    keyboardActivityTimeout = setTimeout(() => {
      keyboardActivityDetected = false;
      altPressed = false;
      winPressed = false;
    }, 2000);
  };
  
  // Method 3: Page focus tracking using requestAnimationFrame
  let animationFrameActive = true;
  let lastFrameTime = Date.now();
  
  const frameTracker = () => {
    if (!isActive) return;
    
    const now = Date.now();
    const timeSinceLastFrame = now - lastFrameTime;
    
    // **MODIFIED: Only detect very large frame gaps (5+ seconds) as potential tab switches**
    // Smaller gaps can be caused by browser rendering, GC, etc.
    if (timeSinceLastFrame > 5000) {
      console.log('🎬 Large animation frame gap detected:', timeSinceLastFrame + 'ms');
      // Only record as candidate if REALLY large (10+ seconds)
      if (timeSinceLastFrame > 10000) {
        recordCandidateDetection({
          method: 'animation-frame',
          evidence: `Frame gap: ${timeSinceLastFrame}ms`,
          confidence: 'low' // Reduced from medium - still not very reliable
        });
      }
    }
    
    lastFrameTime = now;
    requestAnimationFrame(frameTracker);
  };
  
  // Method 4: Performance timing analysis
  let performanceCheckInterval;
  const performanceCheck = () => {
    if (!isActive) return;
    
    const now = performance.now();
    const timeSinceActivity = Date.now() - lastActiveTime;
    
    // **DISABLED: Inactivity detection is too aggressive - students often read without moving mouse**
    // Only log for debugging, don't trigger tab switch
    if (timeSinceActivity > 30000 && !mouseMovementDetected && !keyboardActivityDetected) {
      console.log('🕒 Prolonged inactivity detected (not penalized):', timeSinceActivity + 'ms');
      // Don't call onTabSwitch - this is too prone to false positives
      // Students may be reading a question carefully without moving the mouse
    }
  };
  
  // Method 5: Document state polling (bypasses event blocking)
  let documentStateInterval;
  let lastDocumentState = {
    hasFocus: document.hasFocus(),
    hidden: document.hidden,
    visibilityState: document.visibilityState
  };
  
  const documentStatePoller = () => {
    if (!isActive) return;
    
    const currentState = {
      hasFocus: document.hasFocus(),
      hidden: document.hidden,
      visibilityState: document.visibilityState
    };
    
    // Check for state changes that indicate tab switching
    if (currentState.hasFocus !== lastDocumentState.hasFocus) {
      console.log('📋 Document focus change detected:', currentState.hasFocus);
      if (!currentState.hasFocus) {
        recordCandidateDetection({
          method: 'document-focus',
          evidence: 'Document lost focus',
          confidence: 'high'
        });
      }
    }
    
    if (currentState.hidden !== lastDocumentState.hidden) {
      console.log('👁️ Document hidden state change:', currentState.hidden);
      if (currentState.hidden) {
        recordCandidateDetection({
          method: 'document-hidden',
          evidence: 'Document became hidden',
          confidence: 'high'
        });
      }
    }
    
    lastDocumentState = currentState;
  };

  // Record a candidate detection and corroborate within a short window
  function recordCandidateDetection(detection) {
    try {
      // **FIX: Check startup grace period - ignore detections during first 3 seconds**
      const timeSinceStart = Date.now() - startTime;
      if (timeSinceStart < STARTUP_GRACE_PERIOD) {
        console.log(`⏳ Ignoring detection during startup grace period (${timeSinceStart}ms < ${STARTUP_GRACE_PERIOD}ms):`, detection.method);
        return;
      }
      
      // **FIX: Check if we recently had a fullscreen change - ignore detections during transition**
      const timeSinceLastActivity = Date.now() - lastActiveTime;
      if (timeSinceLastActivity < 0) {
        // lastActiveTime was set in the future during fullscreen transition
        console.log('⏳ Ignoring detection during fullscreen transition grace period:', detection.method);
        return;
      }
      
      detection.timestamp = Date.now();
      pendingDetections.push(detection);

      // After window, decide if it's a true switch: require either
      // - another detection within window OR
      // - a persistent state (document.hidden or !document.hasFocus)
      setTimeout(() => {
        if (!isActive) return;
        
        // **FIX: Double-check grace period hasn't been extended**
        const timeSinceLastActivity2 = Date.now() - lastActiveTime;
        if (timeSinceLastActivity2 < 0) {
          console.log('⏳ Ignoring corroboration check during grace period');
          pendingDetections.length = 0;
          return;
        }
        
        // Find detections in window
        const now = Date.now();
        const windowDetections = pendingDetections.filter(d => now - d.timestamp <= CORROBORATION_WINDOW);
        // Check for corroboration: at least 2 different methods OR persistent hidden/focus loss
        const uniqueMethods = new Set(windowDetections.map(d => d.method));
        const persistentHidden = document.hidden || !document.hasFocus();

        if (uniqueMethods.size >= 2 || persistentHidden) {
          // choose the highest confidence detection to report
          const sorted = windowDetections.sort((a,b) => {
            const rank = { 'very-high':3, 'high':2, 'medium':1, 'low':0 };
            return (rank[b.confidence]||0) - (rank[a.confidence]||0);
          });
          const report = sorted[0] || detection;
          console.log('✅ Corroborated tab-switch detection:', Array.from(uniqueMethods), 'persistentHidden:', persistentHidden);
          onTabSwitch({ method: report.method, evidence: report.evidence, confidence: report.confidence });
          // clear pending detections
          pendingDetections.length = 0;
        } else {
          // Not corroborated - drop these candidates
          // Keep recent detections for overlapping windows
          const cutoff = now - CORROBORATION_WINDOW;
          for (let i = pendingDetections.length - 1; i >= 0; i--) {
            if (pendingDetections[i].timestamp < cutoff) pendingDetections.splice(i,1);
          }
          console.log('ℹ️ Detection candidate dropped (no corroboration)');
        }
      }, CORROBORATION_WINDOW + 50);
    } catch (e) {
      console.error('Error recording candidate detection', e);
    }
  }
  
  // Method 6: Network request timing - **DISABLED due to false positives**
  // Network latency varies wildly and is not a reliable indicator of tab switching
  let networkTestInterval;
  const networkActivityTest = () => {
    // Disabled - too many false positives from normal network latency
    return;
  };
  
  // Method 7: Intersection Observer - **DISABLED due to false positives**
  // In fullscreen, elements can appear "not intersecting" due to browser rendering quirks
  let intersectionObserver;
  const setupIntersectionObserver = () => {
    // Return empty cleanup function - this detection method is disabled
    return () => {};
  };
  
  // Start all detection methods
  document.addEventListener('mousemove', mouseHandler);
  document.addEventListener('keydown', keyboardHandler);
  document.addEventListener('keyup', keyboardHandler);
  
  frameTracker();
  
  performanceCheckInterval = setInterval(performanceCheck, 1000);
  documentStateInterval = setInterval(documentStatePoller, 500);
  networkTestInterval = setInterval(networkActivityTest, 5000);
  
  const intersectionCleanup = setupIntersectionObserver();
  
  // Cleanup function
  return () => {
    isActive = false;
    
    document.removeEventListener('mousemove', mouseHandler);
    document.removeEventListener('keydown', keyboardHandler);
    document.removeEventListener('keyup', keyboardHandler);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    clearInterval(performanceCheckInterval);
    clearInterval(documentStateInterval);
    clearInterval(networkTestInterval);
    clearTimeout(mouseMovementTimeout);
    clearTimeout(keyboardActivityTimeout);
    
    intersectionCleanup();
    
    console.log('🧹 Bypass-resistant tab detection cleanup completed');
  };
};

/**
 * Direct test for Always Active Window extension by checking actual behavior
 * This function tests if tab switching detection is actually working in real-time
 * @returns {Object} Direct detection results
 */
export const directAlwaysActiveWindowTest = () => {
  const results = {
    detected: false,
    evidence: [],
    confidence: 'low',
    details: []
  };

  try {
    // Test 1: Check if document.hidden stays false when it should be true
    const originalHidden = document.hidden;
    results.details.push(`Initial document.hidden: ${originalHidden}`);

    // Test 2: Check if visibilitychange events are being suppressed
    let visibilityEventFired = false;
    const testHandler = () => { visibilityEventFired = true; };
    
    document.addEventListener('visibilitychange', testHandler, { once: true });
    
    // Manually trigger visibilitychange
    const event = new Event('visibilitychange', { bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    
    // Remove handler immediately
    document.removeEventListener('visibilitychange', testHandler);
    
    if (!visibilityEventFired) {
      results.detected = true;
      results.evidence.push('Visibility change events are being blocked');
      results.confidence = 'high';
    }
    results.details.push(`Visibility event fired: ${visibilityEventFired}`);

    // Test 3: Check for specific Always Active Window patterns
    const checkExtensionPatterns = () => {
      // Check for injected scripts
      const scripts = Array.from(document.scripts);
      for (let script of scripts) {
        if (script.src && (
          script.src.includes('always') || 
          script.src.includes('active') ||
          script.src.includes('window-extension')
        )) {
          results.detected = true;
          results.evidence.push(`Suspicious script found: ${script.src}`);
          results.confidence = 'high';
        }
      }

      // Check for extension content scripts
      const extensionElements = document.querySelectorAll('[data-always-active], [id*="always-active"], [class*="always-active"]');
      if (extensionElements.length > 0) {
        results.detected = true;
        results.evidence.push(`Extension DOM elements found: ${extensionElements.length}`);
        results.confidence = 'high';
      }

      // Check for modified window properties
      const suspiciousProps = ['alwaysActive', 'keepAlive', 'stayAwake', 'noSleep'];
      suspiciousProps.forEach(prop => {
        if (window[prop] !== undefined) {
          results.detected = true;
          results.evidence.push(`Suspicious window property found: ${prop}`);
          results.confidence = 'high';
        }
      });
    };

    checkExtensionPatterns();

    // Test 4: Behavior-based detection - Check if focus events are artificially maintained
    let focusEventCount = 0;
    const focusCounter = () => focusEventCount++;
    
    window.addEventListener('focus', focusCounter);
    
    // Trigger multiple blur/focus events rapidly
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    }
    
    window.removeEventListener('focus', focusCounter);
    
    if (focusEventCount > 3) {
      results.detected = true;
      results.evidence.push(`Abnormal focus event count: ${focusEventCount} (expected: 3 or less)`);
      results.confidence = 'medium';
    }
    results.details.push(`Focus event count: ${focusEventCount}`);

    // Test 5: Check if Page Visibility API is being overridden
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    if (visibilityDescriptor && visibilityDescriptor.get) {
      const getterSource = visibilityDescriptor.get.toString();
      if (!getterSource.includes('[native code]')) {
        results.detected = true;
        results.evidence.push('Page Visibility API has been overridden');
        results.confidence = 'high';
        results.details.push(`Hidden getter: ${getterSource.substring(0, 100)}...`);
      }
    }

    // Test 6: Check performance timing for extension interference
    if (window.performance && window.performance.getEntries) {
      const entries = window.performance.getEntries();
      const extensionEntries = entries.filter(entry => 
        entry.name && entry.name.includes('chrome-extension://')
      );
      if (extensionEntries.length > 0) {
        results.detected = true;
        results.evidence.push(`Extension performance entries found: ${extensionEntries.length}`);
        results.confidence = 'medium';
      }
    }

    // Test 7: Direct behavioral test - simulate tab switch
    const testTabSwitchSimulation = () => {
      const before = Date.now();
      
      // Simulate what happens when user switches tabs
      Object.defineProperty(document, 'hidden', { 
        value: true, 
        configurable: true,
        writable: true 
      });
      
      const after = Date.now();
      const timeTaken = after - before;
      
      // Check if the property actually changed
      const actuallyHidden = document.hidden === true;
      
      // Restore original state
      Object.defineProperty(document, 'hidden', { 
        value: originalHidden, 
        configurable: true,
        writable: true 
      });
      
      if (!actuallyHidden) {
        results.detected = true;
        results.evidence.push('Cannot modify document.hidden property - likely blocked by extension');
        results.confidence = 'high';
      }
      
      results.details.push(`Property modification test: ${actuallyHidden ? 'success' : 'blocked'}`);
      results.details.push(`Time to modify property: ${timeTaken}ms`);
    };

    testTabSwitchSimulation();

    // Final confidence assessment
    if (results.evidence.length >= 3) {
      results.confidence = 'very-high';
    } else if (results.evidence.length >= 2) {
      results.confidence = 'high';
    } else if (results.evidence.length >= 1) {
      results.confidence = 'medium';
    }

    results.details.push(`Final detection result: ${results.detected ? 'EXTENSION DETECTED' : 'No extension detected'}`);
    results.details.push(`Confidence level: ${results.confidence}`);
    results.details.push(`Evidence count: ${results.evidence.length}`);

  } catch (error) {
    results.detected = true; // Assume detection if tests fail
    results.evidence.push(`Detection test failed: ${error.message}`);
    results.confidence = 'medium';
    results.details.push(`Error during detection: ${error.message}`);
  }

  return results;
};

/**
 * Performs a comprehensive real-time test to verify tab switching detection works
 * This function specifically tests for Always Active Window and similar extensions
 * @returns {Promise<Object>} Comprehensive test results
 */
export const performRealTimeTabSwitchTest = () => {
  return new Promise((resolve) => {
    const results = {
      visibilityApiWorking: false,
      focusEventsWorking: false,
      hiddenPropertyAccessible: false,
      visibilityStateAccessible: false,
      extensionInterference: false,
      overallWorking: false,
      details: []
    };

    // Test 1: Check if visibility API properties exist and are accessible
    try {
      results.hiddenPropertyAccessible = typeof document.hidden === 'boolean';
      results.visibilityStateAccessible = typeof document.visibilityState === 'string';
      results.details.push(`Hidden property: ${results.hiddenPropertyAccessible ? 'accessible' : 'blocked'}`);
      results.details.push(`VisibilityState property: ${results.visibilityStateAccessible ? 'accessible' : 'blocked'}`);
    } catch (e) {
      results.details.push(`Visibility API access error: ${e.message}`);
    }

    // Test 2: Test visibility change events
    let visibilityEventCount = 0;
    const visibilityHandler = () => {
      visibilityEventCount++;
      results.details.push(`Visibility change event triggered (count: ${visibilityEventCount})`);
    };

    document.addEventListener('visibilitychange', visibilityHandler);

    // Test 3: Test focus/blur events
    let focusEventCount = 0;
    let blurEventCount = 0;
    
    const focusHandler = () => {
      focusEventCount++;
      results.details.push(`Focus event triggered (count: ${focusEventCount})`);
    };
    
    const blurHandler = () => {
      blurEventCount++;
      results.details.push(`Blur event triggered (count: ${blurEventCount})`);
    };

    window.addEventListener('focus', focusHandler);
    window.addEventListener('blur', blurHandler);

    // Perform tests
    setTimeout(() => {
      // Test visibility change
      document.dispatchEvent(new Event('visibilitychange'));
      
      // Test focus/blur
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
      
      setTimeout(() => {
        // Test manipulation detection
        const originalHidden = document.hidden;
        const originalVisibilityState = document.visibilityState;
        
        try {
          // Try to modify visibility state (Always Active Window might prevent this)
          Object.defineProperty(document, 'hidden', { value: true, configurable: true });
          Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
          
          document.dispatchEvent(new Event('visibilitychange'));
          
          setTimeout(() => {
            // Check if properties were actually changed
            const hiddenChanged = document.hidden === true;
            const visibilityChanged = document.visibilityState === 'hidden';
            
            results.details.push(`Hidden state change test: ${hiddenChanged ? 'worked' : 'blocked'}`);
            results.details.push(`Visibility state change test: ${visibilityChanged ? 'worked' : 'blocked'}`);
            
            // Restore original values
            try {
              Object.defineProperty(document, 'hidden', { value: originalHidden, configurable: true });
              Object.defineProperty(document, 'visibilityState', { value: originalVisibilityState, configurable: true });
            } catch (e) {
              results.details.push(`Failed to restore original values: ${e.message}`);
            }
            
            // Cleanup event listeners
            document.removeEventListener('visibilitychange', visibilityHandler);
            window.removeEventListener('focus', focusHandler);
            window.removeEventListener('blur', blurHandler);
            
            // Analyze results
            results.visibilityApiWorking = visibilityEventCount > 0;
            results.focusEventsWorking = focusEventCount > 0 && blurEventCount > 0;
            
            // Check for extension interference
            results.extensionInterference = 
              !results.visibilityApiWorking || 
              !results.focusEventsWorking ||
              !hiddenChanged ||
              !visibilityChanged;
            
            results.overallWorking = 
              results.visibilityApiWorking && 
              results.focusEventsWorking && 
              !results.extensionInterference;
            
            results.details.push(`Final assessment: ${results.overallWorking ? 'Tab switching detection working' : 'Tab switching detection compromised'}`);
            
            if (results.extensionInterference) {
              results.details.push('CRITICAL: Extension interference detected - Always Active Window or similar extension may be active');
            }
            
            resolve(results);
          }, 200);
        } catch (e) {
          results.details.push(`Property modification test failed: ${e.message}`);
          results.extensionInterference = true;
          resolve(results);
        }
      }, 100);
    }, 100);
  });
};

/**
 * Tests if tab switching and focus detection is working properly
 * @returns {Promise<Object>} Test results
 */
export const testTabSwitchingDetection = () => {
  return new Promise((resolve) => {
    let focusEvents = 0;
    let blurEvents = 0;
    let visibilityChanges = 0;
    
    const focusHandler = () => focusEvents++;
    const blurHandler = () => blurEvents++;
    const visibilityHandler = () => visibilityChanges++;
    
    // Add event listeners
    window.addEventListener('focus', focusHandler);
    window.addEventListener('blur', blurHandler);
    document.addEventListener('visibilitychange', visibilityHandler);
    
    // Test focus/blur events
    setTimeout(() => {
      // Simulate events
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
      
      // Test visibility API
      const originalHidden = document.hidden;
      const originalVisibilityState = document.visibilityState;
      
      // Try to simulate tab switch
      document.dispatchEvent(new Event('visibilitychange'));
      
      setTimeout(() => {
        // Cleanup
        window.removeEventListener('focus', focusHandler);
        window.removeEventListener('blur', blurHandler);
        document.removeEventListener('visibilitychange', visibilityHandler);
        
        const isWorking = focusEvents > 0 && blurEvents > 0 && visibilityChanges > 0;
        
        resolve({
          isTabSwitchingDetectionWorking: isWorking,
          focusEvents,
          blurEvents,
          visibilityChanges,
          canDetectHidden: document.hidden !== undefined,
          canDetectVisibilityState: document.visibilityState !== undefined,
          warning: !isWorking ? 'Tab switching detection may be compromised by browser extensions' : null
        });
      }, 100);
    }, 100);
  });
};

/**
 * Comprehensive security check for quiz environment
 * @returns {Object} Complete security assessment
 */
export const performComprehensiveSecurityCheck = async () => {
  const results = {
    overall: 'unknown',
    remoteConnection: null,
    extensions: null,
    incognitoMode: null,
    violations: [],
    recommendations: [],
    blocking: false,
    timestamp: new Date()
  };
  
  try {
    // 1. Check for remote connections
    console.log('🔍 Checking for remote connections...');
    results.remoteConnection = detectRemoteConnections();
    
    if (results.remoteConnection.remoteDesktopDetected) {
      results.violations.push({
        type: 'REMOTE_CONNECTION_DETECTED',
        severity: 'HIGH',
        message: 'Remote desktop software detected',
        detected: results.remoteConnection.detectedRemoteApps
      });
      results.blocking = true;
    }
    
    if (results.remoteConnection.screenSharingPossible) {
      results.violations.push({
        type: 'SCREEN_SHARING_POSSIBLE',
        severity: 'MEDIUM',
        message: 'Possible screen sharing detected',
        indicators: results.remoteConnection.suspiciousActivity
      });
    }
    
    // 2. Check browser extensions
    console.log('🔍 Checking for browser extensions...');
    results.extensions = detectChromeExtensions();
    
    if (results.extensions.detected.length > 0) {
      results.violations.push({
        type: 'EXTENSIONS_DETECTED',
        severity: 'MEDIUM',
        message: 'Browser extensions detected',
        extensions: results.extensions.detected
      });
    }
    
    // 3. Check incognito mode
    console.log('🔍 Checking incognito mode...');
    results.incognitoMode = await detectIncognitoMode();
    
    if (!results.incognitoMode) {
      results.recommendations.push({
        type: 'USE_INCOGNITO_MODE',
        message: 'Consider using incognito/private browsing mode for enhanced security',
        priority: 'MEDIUM'
      });
    }
    
    // 4. Generate recommendations
    if (results.violations.length === 0 && results.incognitoMode) {
      results.overall = 'SECURE';
      results.recommendations.push({
        type: 'ENVIRONMENT_SECURE',
        message: 'Quiz environment appears secure',
        priority: 'INFO'
      });
    } else if (results.blocking) {
      results.overall = 'BLOCKED';
      results.recommendations.push({
        type: 'SECURITY_BLOCK',
        message: 'Quiz cannot proceed due to security violations',
        priority: 'HIGH'
      });
    } else {
      results.overall = 'WARNING';
      results.recommendations.push({
        type: 'SECURITY_WARNING',
        message: 'Security concerns detected, proceed with caution',
        priority: 'MEDIUM'
      });
    }
    
    // 5. Add specific recommendations
    if (results.remoteConnection.remoteDesktopDetected) {
      results.recommendations.push({
        type: 'DISABLE_REMOTE_SOFTWARE',
        message: 'Please close all remote desktop applications before taking the quiz',
        priority: 'HIGH'
      });
    }
    
    if (results.extensions.detected.length > 0) {
      results.recommendations.push({
        type: 'DISABLE_EXTENSIONS',
        message: 'Please disable browser extensions or use incognito mode',
        priority: 'MEDIUM',
        instructions: getExtensionDisableInstructions()
      });
    }
    
  } catch (error) {
    console.error('Comprehensive security check failed:', error);
    results.overall = 'ERROR';
    results.violations.push({
      type: 'SECURITY_CHECK_FAILED',
      severity: 'HIGH',
      message: 'Unable to verify security environment',
      error: error.message
    });
  }
  
  return results;
};

/**
 * Continuous extension detection that runs during quiz (especially after fullscreen)
 * This detects extensions that may activate or change behavior in fullscreen mode
 * @param {Function} onExtensionDetected - Callback when extension behavior is detected
 * @param {number} checkInterval - How often to check (default 5000ms)
 * @returns {Function} Cleanup function
 */
export const startContinuousExtensionDetection = (onExtensionDetected, checkInterval = 5000) => {
  let isActive = true;
  let checkCount = 0;
  let detectionLog = [];
  let previousState = null;

  console.log('🔍 Starting continuous extension detection');

  const performExtensionCheck = async () => {
    if (!isActive) return;
    
    checkCount++;
    const results = {
      timestamp: new Date().toISOString(),
      checkNumber: checkCount,
      detections: [],
      isFullscreen: !!document.fullscreenElement || 
                   !!document.webkitFullscreenElement || 
                   !!document.mozFullScreenElement || 
                   !!document.msFullscreenElement
    };

    try {
      // Test 1: Visibility API manipulation test
      // If document.hidden returns false when tab is actually hidden, extension is interfering
      const visibilityTest = () => {
        // Create a test by simulating conditions
        const originalHidden = document.hidden;
        const originalVisibilityState = document.visibilityState;
        
        // Store original getter
        const hiddenDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
        const visibilityDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
        
        // Check if getters have been modified
        if (hiddenDescriptor && hiddenDescriptor.get) {
          const getterString = hiddenDescriptor.get.toString();
          if (!getterString.includes('[native code]')) {
            results.detections.push({
              type: 'visibility-api-modified',
              evidence: 'document.hidden getter has been overridden',
              severity: 'critical'
            });
            return true;
          }
        }
        
        if (visibilityDescriptor && visibilityDescriptor.get) {
          const getterString = visibilityDescriptor.get.toString();
          if (!getterString.includes('[native code]')) {
            results.detections.push({
              type: 'visibility-api-modified',
              evidence: 'document.visibilityState getter has been overridden',
              severity: 'critical'
            });
            return true;
          }
        }

        return false;
      };

      // Test 2: Focus event behavior test
      const focusEventTest = () => {
        let focusBlocked = false;
        let blurBlocked = false;
        let focusFired = false;
        let blurFired = false;

        const focusHandler = () => { focusFired = true; };
        const blurHandler = () => { blurFired = true; };

        window.addEventListener('focus', focusHandler, { once: true });
        window.addEventListener('blur', blurHandler, { once: true });

        // Try to dispatch events
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));

        window.removeEventListener('focus', focusHandler);
        window.removeEventListener('blur', blurHandler);

        // If events are being blocked or modified
        if (!focusFired) {
          focusBlocked = true;
          results.detections.push({
            type: 'focus-event-blocked',
            evidence: 'Focus events are being intercepted or blocked',
            severity: 'high'
          });
        }

        if (!blurFired) {
          blurBlocked = true;
          results.detections.push({
            type: 'blur-event-blocked',
            evidence: 'Blur events are being intercepted or blocked',
            severity: 'high'
          });
        }

        return focusBlocked || blurBlocked;
      };

      // Test 3: Check for known extension global objects
      const globalObjectTest = () => {
        const suspiciousGlobals = [
          { name: 'alwaysActiveWindow', type: 'Always Active Window' },
          { name: '__alwaysActive', type: 'Always Active Extension' },
          { name: '__tabActive', type: 'Tab Active Extension' },
          { name: 'stayAlive', type: 'Stay Alive Extension' },
          { name: '__noSleep', type: 'No Sleep Extension' },
          { name: 'keepAliveInterval', type: 'Keep Alive Extension' }
        ];

        let detected = false;
        suspiciousGlobals.forEach(global => {
          if (window[global.name] !== undefined) {
            results.detections.push({
              type: 'extension-global-object',
              evidence: `Detected ${global.type} via global: ${global.name}`,
              severity: 'critical'
            });
            detected = true;
          }
        });

        return detected;
      };

      // Test 4: Check for modified setTimeout/setInterval
      const timerFunctionTest = () => {
        const setTimeoutStr = window.setTimeout.toString();
        const setIntervalStr = window.setInterval.toString();

        if (!setTimeoutStr.includes('[native code]') || !setIntervalStr.includes('[native code]')) {
          results.detections.push({
            type: 'timer-functions-modified',
            evidence: 'setTimeout or setInterval have been overridden',
            severity: 'high'
          });
          return true;
        }
        return false;
      };

      // Test 5: Real-time focus state check
      const focusStateTest = () => {
        // This test is most reliable in fullscreen mode
        if (!results.isFullscreen) return false;

        // In fullscreen, document should always be focused unless user switches tabs
        // We track if the state seems artificially maintained
        if (previousState && previousState.isFullscreen) {
          // If focus was supposedly lost but hasFocus returns true, suspicious
          const currentFocus = document.hasFocus();
          const currentHidden = document.hidden;

          // Check for impossible states
          if (currentHidden && currentFocus) {
            results.detections.push({
              type: 'impossible-state',
              evidence: 'Document reports hidden but focused - extension likely manipulating state',
              severity: 'critical'
            });
            return true;
          }
        }
        return false;
      };

      // Test 6: Animation frame timing test
      const animationFrameTest = () => {
        return new Promise(resolve => {
          let frameCount = 0;
          let suspiciousFrames = 0;
          const startTime = performance.now();

          const checkFrame = () => {
            frameCount++;
            const elapsed = performance.now() - startTime;

            // Check for abnormal timing patterns
            if (frameCount === 5) {
              // Should take roughly 80-100ms for 5 frames at 60fps
              // If it takes much longer but document still shows as focused/visible,
              // something is manipulating the state
              if (elapsed > 500 && !document.hidden && document.hasFocus()) {
                results.detections.push({
                  type: 'frame-timing-anomaly',
                  evidence: `Frame timing abnormal: ${elapsed}ms for ${frameCount} frames but document shows active`,
                  severity: 'medium'
                });
                suspiciousFrames++;
              }
              resolve(suspiciousFrames > 0);
            } else {
              requestAnimationFrame(checkFrame);
            }
          };

          requestAnimationFrame(checkFrame);

          // Timeout fallback
          setTimeout(() => resolve(false), 1000);
        });
      };

      // Run all tests
      visibilityTest();
      focusEventTest();
      globalObjectTest();
      timerFunctionTest();
      focusStateTest();
      await animationFrameTest();

      // Store current state for next comparison
      previousState = {
        isFullscreen: results.isFullscreen,
        hasFocus: document.hasFocus(),
        hidden: document.hidden
      };

      // Log detection results
      if (results.detections.length > 0) {
        console.log('🚨 Extension detection found issues:', results.detections);
        detectionLog.push(results);
        onExtensionDetected({
          ...results,
          isBlocking: results.detections.some(d => d.severity === 'critical'),
          message: results.detections.some(d => d.severity === 'critical')
            ? 'Critical: Extension detected that prevents quiz security monitoring. Please disable extensions and restart the quiz.'
            : 'Warning: Suspicious browser behavior detected. Quiz monitoring may be compromised.'
        });
      } else {
        console.log(`✅ Extension check #${checkCount} passed (fullscreen: ${results.isFullscreen})`);
      }

    } catch (error) {
      console.error('Error during extension detection:', error);
    }
  };

  // Run immediately when started (especially useful when fullscreen is entered)
  performExtensionCheck();

  // Then run periodically
  const intervalId = setInterval(performExtensionCheck, checkInterval);

  // Cleanup function
  return () => {
    isActive = false;
    clearInterval(intervalId);
    console.log(`🧹 Continuous extension detection stopped after ${checkCount} checks`, detectionLog);
    return detectionLog;
  };
};

/**
 * Gets instructions for disabling extensions based on browser
 * @returns {Array} Step-by-step instructions
 */
export const getExtensionDisableInstructions = () => {
  const userAgent = navigator.userAgent;
  
  if (userAgent.includes('Chrome')) {
    return [
      'Press Ctrl+Shift+N (Windows) or Cmd+Shift+N (Mac) to open incognito mode',
      'Or go to Chrome Settings → Extensions → Toggle off all extensions',
      'Or use chrome://extensions/ to disable extensions manually'
    ];
  } else if (userAgent.includes('Firefox')) {
    return [
      'Press Ctrl+Shift+P (Windows) or Cmd+Shift+P (Mac) to open private browsing',
      'Or go to Firefox Menu → Add-ons → Extensions → Disable all extensions'
    ];
  } else if (userAgent.includes('Safari')) {
    return [
      'Press Cmd+Shift+N to open private browsing',
      'Or go to Safari → Preferences → Extensions → Uncheck all extensions'
    ];
  } else if (userAgent.includes('Edge')) {
    return [
      'Press Ctrl+Shift+N to open InPrivate browsing',
      'Or go to Edge Settings → Extensions → Toggle off all extensions'
    ];
  } else {
    return [
      'Open your browser in private/incognito mode',
      'Disable all browser extensions through browser settings'
    ];
  }
};