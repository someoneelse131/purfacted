# PurFacted

Community-driven fact verification platform.

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development without Docker)
- Git

### Development Setup

1. **Clone and configure:**
   ```bash
   git clone <your-repo-url>
   cd purfacted
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Start with Docker:**
   ```bash
   docker-compose up
   ```

3. **Access the app:**
   - App: http://localhost:3000 (or your configured APP_PORT)

### Local Development (without Docker)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start PostgreSQL and Redis** (use Docker or install locally):
   ```bash
   docker-compose up postgres redis
   ```

3. **Setup database:**
   ```bash
   npx prisma db push
   npx prisma generate
   ```

4. **Seed data (optional):**
   ```bash
   npm run db:seed
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

## 🧪 Testing

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 📦 Production Deployment

### Using Docker Compose

1. **Configure production environment:**
   ```bash
   cp .env.example .env
   # Edit .env with production values
   # Make sure to set strong passwords!
   ```

2. **Build and start:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Configure your reverse proxy (nginx):**
   ```nginx
   server {
       listen 443 ssl;
       server_name purfacted.com;

       # SSL configuration...

       location / {
           proxy_pass http://localhost:3000;  # Your APP_PORT
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

### Database Migrations

```bash
# Push schema changes
npx prisma db push

# Generate migration (for production)
npx prisma migrate deploy
```

## 🔧 Configuration

All configuration is done via environment variables. See `.env.example` for all available options.

### Key Configuration Areas

| Category | Variables |
|----------|-----------|
| App | APP_PORT, PUBLIC_URL |
| Database | DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD |
| Redis | REDIS_HOST, REDIS_PORT, REDIS_PASSWORD |
| Mail | MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASSWORD |
| LLM | LLM_API_KEY, LLM_MODEL |
| Trust System | TRUST_* variables |
| Vote Weights | VOTE_WEIGHT_* variables |

## 📁 Project Structure

```
purfacted/
├── src/
│   ├── lib/
│   │   ├── server/      # Server-side code
│   │   ├── utils/       # Shared utilities
│   │   └── components/  # Svelte components
│   └── routes/          # SvelteKit routes
├── prisma/              # Database schema
├── tests/               # Test files
├── static/              # Static assets
└── docker-compose.yml   # Docker configuration
```

## 🔐 Security

- All passwords hashed with bcrypt
- Session-based authentication with Lucia
- Rate limiting on sensitive endpoints
- Disposable email blocking
- Captcha protection
- Input validation and sanitization

## 📊 Features

- **User System:** Registration, verification, trust scores
- **Fact Management:** Create, vote, source requirements
- **Expert Verification:** Community-verified credentials
- **Moderation:** Queue-based moderation system
- **Debates:** Private and public discussions
- **Organizations:** Special org accounts with ownership

## 🛠 Development

### Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run preview    # Preview production build
npm run test       # Run tests
npm run lint       # Lint code
npm run format     # Format code
npm run db:push    # Push schema to DB
npm run db:seed    # Seed test data
npm run db:studio  # Open Prisma Studio
```

### Adding a New Feature

1. Update Prisma schema if needed
2. Create/update API routes
3. Create/update components
4. Write tests
5. Update documentation

## 📄 License

[Your License Here]

## 👥 Contributing

[Contributing guidelines here]
