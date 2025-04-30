# URL Redirector Platform

A high-performance URL management platform that enables advanced custom redirect link creation, tracking, and optimization with intelligent routing and analytics.

## Features

- **High-Performance Redirects**: HTTP/2.0 URL routing with zero latency
- **Campaign Management**: Create and manage redirect campaigns with custom paths
- **Link Processing**: Automatic Gmail integration for processing emails with links
- **TrafficStar Integration**: Spent value tracking and daily budget updates
- **Intelligent Routing**: Weighted distribution based on campaign settings
- **Click Tracking**: Monitor performance of all URLs in real-time
- **Budget Management**: Daily budget updates at specified UTC times

## Technology Stack

- **Frontend**: React with TypeScript + Shadcn UI components
- **Backend**: Express.js + Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Email Integration**: Gmail IMAP integration for automatic link processing
- **API Integration**: TrafficStar API for campaign management

## Key Components

### Campaign Management

- Create campaigns with custom paths and redirect methods (direct/bridge)
- Configure price per thousand clicks with 4 decimal precision
- Apply multipliers to adjust click limits across campaign URLs
- Set up TrafficStar integration for spent value tracking

### URL Management

- Add URLs to campaigns with individual click limits
- Track active vs. completed URLs
- Monitor remaining clicks and budget in real-time
- Automatically mark URLs as completed when click limits are reached

### Gmail Integration

- Process emails matching specific criteria
- Extract URLs and add them to campaigns
- Auto-delete processed emails after configurable interval
- Whitelist senders for secure operation

### TrafficStar API Integration

- Connect campaigns to TrafficStar for spent value tracking
- Monitor daily spent values automatically
- Schedule daily budget updates at specific UTC times
- Set budget amount to $10.15 at scheduled times

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Create PostgreSQL database and set DATABASE_URL in environment
4. Configure Gmail integration with valid credentials
5. Configure TrafficStar API key
6. Run migrations: `npm run db:push`
7. Start the application: `npm run dev`

## Configuration

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `TRAFFICSTAR_API_KEY`: API key for TrafficStar integration
- Gmail credentials are configured through the application interface

### Gmail Configuration

Configure the following through application interface:
- IMAP host and port
- Username and password
- Whitelist email senders
- Subject/message patterns for processing
- Auto-delete interval in minutes

### TrafficStar Integration

Configure the following through application interface:
- API key (or use environment variable)
- Connect campaigns to TrafficStar campaigns
- Set budget update time (UTC)
- Track spent values automatically

## API Endpoints

The application provides RESTful API endpoints for:
- Campaign management (CRUD operations)
- URL management (CRUD operations)
- Gmail configuration and monitoring
- TrafficStar integration management
- System maintenance operations

## License

All rights reserved.