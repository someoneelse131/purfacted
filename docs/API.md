# PurFacted API Documentation

Base URL: `/api`

All responses follow the format:
```json
{
  "success": true|false,
  "data": {...} | [...],
  "error": "Error message (if success=false)"
}
```

## Authentication

Authentication uses session cookies managed by Lucia. Include cookies with all requests.

### POST /api/auth/register
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:** 201 Created
```json
{
  "success": true,
  "data": {
    "id": "user_id",
    "email": "user@example.com"
  }
}
```

### POST /api/auth/login
Login to an existing account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "rememberMe": false
}
```

**Response:** 200 OK (sets session cookie)
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "userType": "VERIFIED" }
  }
}
```

### POST /api/auth/logout
End the current session.

**Response:** 200 OK

### POST /api/auth/forgot-password
Request a password reset email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

### POST /api/auth/reset-password
Reset password using token from email.

**Request:**
```json
{
  "token": "reset_token",
  "newPassword": "NewSecure123!"
}
```

### POST /api/auth/change-password
Change password while logged in.

**Request:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass123!"
}
```

### GET /api/auth/verify?token=...
Verify email address.

---

## User

### GET /api/user/profile
Get current user's profile.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "email": "...",
    "firstName": "...",
    "lastName": "...",
    "userType": "VERIFIED",
    "trustScore": 25,
    "settings": {...}
  }
}
```

### PATCH /api/user/profile
Update profile information.

**Request:**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "bio": "Fact enthusiast"
}
```

### PATCH /api/user/email
Change email address.

**Request:**
```json
{
  "newEmail": "newemail@example.com",
  "password": "CurrentPass123!"
}
```

### GET /api/user/notifications
Get notification preferences.

### PATCH /api/user/notifications
Update notification preferences.

**Request:**
```json
{
  "emailOnReply": true,
  "emailOnVote": false,
  "inAppEnabled": true
}
```

### DELETE /api/user/delete
Delete account (soft delete).

**Request:**
```json
{
  "password": "CurrentPass123!",
  "reason": "Optional reason"
}
```

---

## Facts

### GET /api/facts
List facts with pagination and filters.

**Query params:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)
- `status` (string): PENDING | PROVEN | DISPROVEN | DISPUTED | OUTDATED
- `category` (string): Category ID
- `search` (string): Search query
- `sort` (string): recent | votes | trending

**Response:**
```json
{
  "success": true,
  "data": {
    "facts": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

### POST /api/facts
Create a new fact.

**Request:**
```json
{
  "title": "Fact title",
  "content": "Detailed explanation...",
  "categoryId": "category_id",
  "sourceUrls": ["https://source1.com", "https://source2.com"]
}
```

### GET /api/facts/:id
Get a specific fact.

### PATCH /api/facts/:id
Update a fact (creates edit request if not owner).

### DELETE /api/facts/:id
Delete a fact (owner or moderator only).

### POST /api/facts/:id/vote
Vote on a fact.

**Request:**
```json
{
  "value": 1 | -1,
  "isTrue": true | false
}
```

### POST /api/facts/:id/edit
Submit an edit request.

**Request:**
```json
{
  "title": "Updated title",
  "content": "Updated content",
  "reason": "Correction: fixed date"
}
```

### POST /api/facts/:id/veto
Submit a veto against a fact.

**Request:**
```json
{
  "reason": "This fact is incorrect because...",
  "evidence": "https://counter-evidence.com"
}
```

### GET /api/facts/:id/duplicate
Check for duplicate facts.

### POST /api/facts/:id/duplicate
Request merge with duplicate.

**Request:**
```json
{
  "duplicateId": "other_fact_id"
}
```

### POST /api/facts/grammar-check
Check grammar of text.

**Request:**
```json
{
  "text": "Text to check..."
}
```

---

## Sources

### GET /api/sources
List sources with credibility scores.

### POST /api/sources
Add a new source.

**Request:**
```json
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "type": "JOURNAL" | "NEWS_OUTLET" | "GOVERNMENT" | "ACADEMIC" | "BLOG" | "OTHER"
}
```

### POST /api/facts/:id/sources
Link a source to a fact.

---

## Categories

### GET /api/categories
List all categories.

### POST /api/categories
Create a new category.

**Request:**
```json
{
  "name": "Category Name",
  "parentId": "optional_parent_id"
}
```

### GET /api/categories/tree
Get category hierarchy.

### GET /api/categories/lookup?name=...
Find category by name or alias.

### POST /api/categories/:id/aliases
Add category alias.

**Request:**
```json
{
  "alias": "Alternative Name"
}
```

### POST /api/categories/merge-requests
Request category merge.

**Request:**
```json
{
  "sourceId": "category_to_merge",
  "targetId": "category_to_keep"
}
```

### POST /api/categories/merge-requests/:id/vote
Vote on merge request.

---

## Discussions

### GET /api/facts/:id/discussions
Get discussions for a fact.

### POST /api/facts/:id/discussions
Create a discussion.

**Request:**
```json
{
  "type": "PRO" | "CONTRA" | "NEUTRAL",
  "content": "Discussion content..."
}
```

### GET /api/discussions/:id
Get discussion details.

### PATCH /api/discussions/:id
Update discussion.

### DELETE /api/discussions/:id
Delete discussion.

### POST /api/discussions/:id/vote
Vote on discussion.

---

## Comments

### GET /api/facts/:id/comments
Get comments for a fact.

**Query params:**
- `page` (number)
- `limit` (number)

### POST /api/facts/:id/comments
Create a comment.

**Request:**
```json
{
  "content": "Comment text...",
  "parentId": "optional_parent_comment_id"
}
```

### GET /api/comments/:id
Get comment details.

### PATCH /api/comments/:id
Update comment.

### DELETE /api/comments/:id
Delete comment.

### POST /api/comments/:id/vote
Vote on comment.

---

## Debates

### GET /api/debates
List user's debates.

### POST /api/debates
Initiate a new debate.

**Request:**
```json
{
  "factId": "fact_id",
  "opponentId": "other_user_id",
  "initialMessage": "I'd like to debate this fact..."
}
```

### GET /api/debates/:id
Get debate details and messages.

### POST /api/debates/:id/messages
Send a message in debate.

**Request:**
```json
{
  "content": "Message content..."
}
```

### POST /api/debates/:id/publish
Request to publish debate.

**Request:**
```json
{
  "title": "Debate Title"
}
```

### POST /api/debates/:id/vote
Vote on published debate.

### GET /api/facts/:id/debates
Get published debates for a fact.

---

## User Blocking

### POST /api/users/:id/block
Block a user.

### DELETE /api/users/:id/block
Unblock a user.

### GET /api/user/blocked
List blocked users.

---

## Reports

### POST /api/reports
Report content.

**Request:**
```json
{
  "contentType": "FACT" | "COMMENT" | "DISCUSSION" | "DEBATE" | "USER",
  "contentId": "content_id",
  "reason": "SPAM" | "HARASSMENT" | "MISINFORMATION" | "INAPPROPRIATE" | "OTHER",
  "description": "Additional details..."
}
```

### GET /api/reports/:id
Get report status (own reports only).

---

## Expert Verification

### POST /api/verifications
Submit verification request.

**Request (multipart/form-data):**
- `field`: Expertise field
- `institution`: Institution name
- `diploma`: Diploma image file

### GET /api/verifications
List pending verifications (for voters).

### POST /api/verifications/:id
Vote on verification.

**Request:**
```json
{
  "approve": true | false,
  "reason": "Optional reason"
}
```

---

## Organizations

### POST /api/organizations
Register organization.

**Request:**
```json
{
  "name": "Organization Name",
  "domain": "organization.com",
  "website": "https://organization.com",
  "description": "About the organization"
}
```

### GET /api/organizations/:id
Get organization details.

### PATCH /api/organizations/:id
Update organization (owner only).

### POST /api/facts/:id/organizations
Tag organization in fact.

**Request:**
```json
{
  "organizationId": "org_id"
}
```

---

## Moderation (Moderators Only)

### GET /api/moderators
List moderators.

### GET /api/moderation/queue
Get moderation queue.

**Query params:**
- `type`: REPORTED_CONTENT | EDIT_REQUEST | DUPLICATE_MERGE | VETO_REVIEW | ORG_APPROVAL | VERIFICATION_REVIEW | FLAGGED_ACCOUNT
- `status`: PENDING | IN_PROGRESS | RESOLVED | DISMISSED
- `page`, `limit`

### PATCH /api/moderation/queue/:id
Update queue item.

**Request:**
```json
{
  "action": "claim" | "release" | "resolve" | "dismiss",
  "notes": "Resolution notes..."
}
```

### POST /api/moderation/actions
Perform moderation action.

**Request:**
```json
{
  "action": "approve" | "reject" | "warn" | "ban" | "edit" | "override" | "mark_wrong",
  "queueItemId": "queue_item_id",
  "reason": "Reason for action",
  "data": {...}
}
```

---

## Bans (Moderators Only)

### GET /api/bans
List bans.

### POST /api/bans
Create ban.

**Request:**
```json
{
  "userId": "user_id",
  "reason": "Reason for ban",
  "duration": "3d" | "30d" | "permanent"
}
```

### DELETE /api/bans/:id
Lift ban.

---

## Account Flags (Moderators Only)

### GET /api/flags
List flagged accounts.

### PATCH /api/flags/:id
Review flagged account.

---

## User Trust Voting

### POST /api/users/:id/trust-vote
Vote on user trust.

**Request:**
```json
{
  "value": 1 | -1
}
```

---

## Notifications

### GET /api/notifications
List notifications.

**Query params:**
- `page`, `limit`
- `unreadOnly` (boolean)

### PATCH /api/notifications/:id
Mark notification as read.

### DELETE /api/notifications/:id
Delete notification.

### GET /api/notifications/stream
SSE endpoint for real-time notifications.

### GET /api/notifications/preferences
Get notification preferences.

### PATCH /api/notifications/preferences
Update notification preferences.

### GET /api/notifications/unsubscribe
Unsubscribe from email notifications (via email link).

**Query params:**
- `userId`
- `type`
- `token`

---

## Public Profiles

### GET /api/profiles/:id
Get public user profile.

### GET /api/profiles
Search profiles.

**Query params:**
- `search` (string)
- `userType` (string)
- `page`, `limit`

---

## Statistics

### GET /api/stats
Get platform statistics.

**Query params:**
- `period`: day | week | month | all

**Response:**
```json
{
  "success": true,
  "data": {
    "users": { "total": 1000, "active": 250 },
    "facts": { "total": 5000, "proven": 3500 },
    "votes": { "total": 50000 },
    "trustDistribution": {...},
    "activityChart": [...]
  }
}
```

---

## Admin (Moderators Only)

### GET /api/admin
Get admin configuration.

**Response:**
```json
{
  "success": true,
  "data": {
    "trustConfig": {...},
    "voteWeightConfig": {...},
    "featureFlags": {...},
    "systemHealth": {...}
  }
}
```

### PATCH /api/admin
Update configuration.

**Request:**
```json
{
  "action": "update_trust_config" | "update_vote_weight" | "set_feature_flag" | "promote_moderator" | "demote_moderator" | "set_user_type" | "adjust_trust_score",
  ...params
}
```

---

## Anonymous Voting

### POST /api/votes/anonymous
Submit anonymous vote (captcha required).

**Request:**
```json
{
  "factId": "fact_id",
  "value": 1 | -1,
  "captchaToken": "recaptcha_token"
}
```

---

## Health

### GET /api/health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 12345
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

## Rate Limits

- Anonymous: 1 vote per day, 10 requests per minute
- Authenticated: 10 votes per day, 60 requests per minute
- Login attempts: 5 per 15 minutes per IP

## Pagination

All list endpoints support pagination:
- `page`: Page number (1-indexed)
- `limit`: Items per page (max 100)

Response includes:
```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8,
    "hasMore": true
  }
}
```
