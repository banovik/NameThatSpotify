# 🔒 Security Documentation

This document outlines the comprehensive security measures implemented in the Spotify Music Game to prevent common web vulnerabilities and ensure safe operation with 200+ concurrent users.

## 🛡️ Security Features Implemented

### 1. Input Validation & Sanitization

#### **Player Names**
- **Length Limit**: Maximum 32 characters
- **Character Filtering**: Removes dangerous characters (`<>'"`;{}[]()&|$\`)
- **SQL Injection Prevention**: Blocks SQL keywords (`union`, `select`, `insert`, etc.)
- **XSS Prevention**: Blocks script tags and event handlers
- **Command Injection Prevention**: Blocks shell commands and special characters
- **Profanity Filter**: Uses leo-profanity library with leetspeak detection

#### **Game Codes**
- **Format Validation**: Must be exactly 6 digits
- **Character Restriction**: Only numeric characters allowed
- **Length Enforcement**: Strict 6-character limit

#### **Guesses (Artist, Title, Lyrics)**
- **Length Limit**: Maximum 100 characters for artist/title, 50,000 for lyrics
- **Character Filtering**: Same security measures as player names
- **Type Validation**: Separate validation for each guess type
- **Content Filtering**: Blocks malicious patterns and scripts

#### **Admin Passwords**
- **Length Limit**: Maximum 100 characters
- **Character Filtering**: Removes dangerous characters
- **SQL Injection Prevention**: Blocks SQL keywords

### 2. SQL Injection Prevention

#### **Parameterized Queries**
All database operations use parameterized queries with SQLite3:

```javascript
// ✅ Safe - Parameterized query
db.run('INSERT OR REPLACE INTO lyrics_cache (artist, title, lyrics) VALUES (?, ?, ?)', 
  [normalizedArtist, normalizedTitle, lyricsValidation.sanitized]);

// ✅ Safe - Parameterized query
db.get('SELECT lyrics FROM lyrics_cache WHERE artist = ? AND title = ?',
  [normalizedArtist, normalizedTitle]);
```

#### **Input Validation**
- All inputs are validated before database operations
- SQL keywords are blocked in user inputs
- Special characters are sanitized

### 3. Cross-Site Scripting (XSS) Prevention

#### **Input Sanitization**
- Removes HTML tags: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`
- Blocks JavaScript protocols: `javascript:`, `vbscript:`
- Removes event handlers: `onload`, `onerror`, `onclick`, etc.
- Sanitizes all user inputs before storage and display

#### **Output Encoding**
- React automatically escapes content in JSX
- No direct HTML insertion from user input
- All user content is treated as text, not HTML

### 4. Command Injection Prevention

#### **Input Filtering**
- Blocks shell commands: `cmd`, `command`, `powershell`, `bash`, `sh`
- Removes special characters: `;`, `&`, `|`, `` ` ``, `$`, `()`, `{}`, `[]`
- Blocks function calls: `exec`, `system`, `eval`, `Function`
- Prevents template injection: `${...}` patterns

### 5. Rate Limiting & Brute Force Protection

#### **Admin Password Protection**
- **Attempt Limit**: 5 failed attempts
- **Cooldown Period**: 1 minute after 5 failed attempts
- **IP Tracking**: Tracks attempts per IP address
- **Automatic Reset**: Resets on successful login

#### **Game Code Protection**
- **Attempt Limit**: 5 failed attempts
- **Cooldown Period**: 1 minute after 5 failed attempts
- **IP Tracking**: Tracks attempts per IP address
- **Automatic Reset**: Resets on successful verification

#### **Guess Rate Limiting**
- **Per Player**: 1 guess per second per player
- **Automatic Cleanup**: Removes old timestamps after 1 hour
- **Memory Efficient**: Minimal storage overhead

### 6. IP Blocking & Player Management

#### **Player Kicking**
- **Admin Control**: Only authenticated admins can kick players
- **IP Blocking**: Kicked players are blocked for 10 minutes
- **Reason Tracking**: Records kick reasons for monitoring
- **Automatic Cleanup**: Expired blocks are automatically removed

#### **Connection Limits**
- **Maximum Connections**: 250 concurrent Socket.IO connections
- **Memory Monitoring**: Tracks active connections
- **Automatic Cleanup**: Removes disconnected players

### 7. Memory & Performance Security

#### **Memory Management**
- **Automatic Cleanup**: Removes old data every 5 minutes
- **Memory Monitoring**: Logs memory usage every 2 minutes
- **Garbage Collection**: Forces GC when available
- **Data Limits**: Limits stored guesses and song states

#### **Resource Protection**
- **Connection Limits**: Prevents resource exhaustion
- **Input Size Limits**: Prevents large payload attacks
- **Timeout Protection**: Socket.IO timeouts prevent hanging connections

### 8. Authentication & Authorization

#### **Admin Authentication**
- **Password Protection**: Secure admin password verification
- **Session Management**: Tracks admin connection state
- **Access Control**: Admin-only endpoints are protected

#### **Game Code System**
- **Temporary Codes**: 6-digit codes expire after 30 minutes
- **Unique Sessions**: Each admin login generates a new code
- **Automatic Cleanup**: Expired sessions are automatically reset

## 🔍 Security Testing

### **Input Validation Testing**

#### **SQL Injection Attempts**
```javascript
// These should all be blocked:
"'; DROP TABLE lyrics_cache; --"
"union select * from users"
"1' OR '1'='1"
"admin'--"
```

#### **XSS Attempts**
```javascript
// These should all be blocked:
"<script>alert('xss')</script>"
"javascript:alert('xss')"
"<img src=x onerror=alert('xss')>"
"<iframe src=javascript:alert('xss')>"
```

#### **Command Injection Attempts**
```javascript
// These should all be blocked:
"; rm -rf /"
"& del C:\\Windows\\System32"
"`whoami`"
"$(cat /etc/passwd)"
```

### **Rate Limiting Testing**
- Attempt 6 admin password guesses → Should be blocked for 1 minute
- Attempt 6 game code guesses → Should be blocked for 1 minute
- Submit guesses faster than 1 per second → Should be rate limited

## 📊 Security Monitoring

### **Logging**
- All security events are logged with timestamps
- Failed authentication attempts are tracked
- Kicked players and blocked IPs are recorded
- Memory usage and cleanup operations are monitored

### **Monitoring Commands**
```bash
# Monitor security events
pm2 logs spotify-game-backend | grep -E "(blocked|kicked|failed|invalid)"

# Monitor memory usage
pm2 logs spotify-game-backend | grep "Memory Usage"

# Monitor active connections
pm2 logs spotify-game-backend | grep "Active connections"
```

## 🚨 Incident Response

### **Security Breach Response**
1. **Immediate Actions**:
   - Block suspicious IP addresses
   - Reset game codes
   - Monitor logs for additional attacks
   - Check for data compromise

2. **Investigation**:
   - Review server logs
   - Check database integrity
   - Analyze attack patterns
   - Identify vulnerability source

3. **Recovery**:
   - Apply security patches
   - Update validation rules
   - Restore from backups if needed
   - Notify affected users

### **Emergency Contacts**
- **Server Admin**: [Your Contact Information]
- **Security Team**: [Security Contact Information]
- **Hosting Provider**: [Provider Support Information]

## 🔄 Security Updates

### **Regular Maintenance**
- **Monthly**: Review security logs and update validation rules
- **Quarterly**: Security audit and penetration testing
- **Annually**: Full security assessment and policy review

### **Update Procedures**
1. Test security changes in development environment
2. Deploy during low-traffic periods
3. Monitor logs for any issues
4. Rollback plan in case of problems

## 📋 Security Checklist

### **Pre-Deployment**
- [ ] All inputs validated and sanitized
- [ ] SQL injection protection implemented
- [ ] XSS protection implemented
- [ ] Rate limiting configured
- [ ] Authentication secured
- [ ] Logging enabled
- [ ] Memory limits set
- [ ] Connection limits configured

### **Post-Deployment**
- [ ] Security monitoring active
- [ ] Logs being collected
- [ ] Backup procedures tested
- [ ] Incident response plan ready
- [ ] Emergency contacts documented

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express.js Security](https://expressjs.com/en/advanced/best-practices-security.html)
- [Socket.IO Security](https://socket.io/docs/v4/security/)

---

**Last Updated**: [Current Date]
**Version**: 1.0
**Security Level**: Production Ready for 200+ Users 