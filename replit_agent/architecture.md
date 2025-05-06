# URL Redirector Platform Architecture

## 1. Overview

The URL Redirector Platform is a high-performance application designed for managing, tracking, and optimizing URL redirects. It enables users to create custom redirect campaigns with features such as intelligent routing, click tracking, and budget management. The system integrates with external services like TrafficStar for campaign management and Gmail for automatic link processing.

The platform employs a modern web architecture with a React frontend and Express.js backend, using PostgreSQL for data persistence. It's built for high performance, with specialized HTTP/2 routing capabilities and real-time analytics.

## 2. System Architecture

The system follows a client-server architecture with clearly separated frontend and backend components:

### 2.1 Frontend Architecture

- **Technology**: React with TypeScript
- **UI Framework**: Shadcn UI components using Tailwind CSS
- **State Management**: React Query for server state
- **Build System**: Vite for fast development and optimized production builds
- **Routing**: Client-side routing (specific library not specified, likely React Router)

### 2.2 Backend Architecture

- **Framework**: Express.js on Node.js
- **Runtime**: ES Modules with TypeScript (compiled to JavaScript)
- **API Style**: RESTful API endpoints
- **HTTP Support**: HTTP/2 support via SPDY
- **Authentication**: Simple API key-based authentication mechanism

### 2.3 Database Architecture

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM for type-safe database access
- **Schema Management**: Drizzle Kit for migrations
- **Connection Pool**: @neondatabase/serverless for database connectivity

### 2.4 High-Level Component Diagram

```
┌────────────┐       ┌────────────────┐       ┌──────────────┐
│            │       │                │       │              │
│   Client   │◄─────►│   Express.js   │◄─────►│  PostgreSQL  │
│  (React)   │       │    Backend     │       │   Database   │
│            │       │                │       │              │
└────────────┘       └───────┬────────┘       └──────────────┘
                             │
                             ▼
        ┌────────────────────┬─────────────────────┐
        │                    │                     │
┌───────▼───────┐   ┌────────▼─────────┐   ┌──────▼───────┐
│               │   │                  │   │              │
│  TrafficStar  │   │  Gmail Service   │   │  High-Perf   │
│     API       │   │  (Email Parser)  │   │ Redirect     │
│               │   │                  │   │ Engine       │
└───────────────┘   └──────────────────┘   └──────────────┘
```

## 3. Key Components

### 3.1 Campaign Management

- **Purpose**: Manages redirect campaigns with custom paths and configuration settings
- **Key Features**:
  - Campaign creation with custom paths
  - Redirect method selection (direct, meta refresh, HTTP/2, etc.)
  - Price per thousand clicks configuration with 4 decimal precision
  - Multiplier functionality for click limit adjustments
  - Budget update scheduling at specific UTC times
- **Implementation**: Server-side logic with database persistence and RESTful API endpoints

### 3.2 URL Management

- **Purpose**: Handles individual URLs within campaigns, tracking clicks and status
- **Key Features**:
  - URL addition with individual click limits
  - Status tracking (active, paused, completed, deleted, rejected)
  - Click counting and automatic deactivation when limits are reached
  - Optimized redirect mechanisms (various HTTP methods)
- **Implementation**: Backend services with database persistence, protected by triggers to prevent unauthorized click value modifications

### 3.3 High-Performance Redirect Engine

- **Purpose**: Provides extremely low-latency redirect functionality with various methods
- **Key Features**:
  - Multiple redirect methods (direct, meta refresh, HTTP 307, etc.)
  - HTTP/2 optimization
  - Header optimization for minimal response size
  - Response time optimizations
- **Implementation**: Custom Express.js middleware with HTTP/2 support via SPDY

### 3.4 Click Tracking and Analytics

- **Purpose**: Records and analyzes click data for all redirects
- **Key Features**:
  - Click logging for URLs with timestamps
  - Campaign redirect logging
  - Filtering by time ranges (today, yesterday, custom range, etc.)
  - File-based logging with database synchronization
- **Implementation**: Combination of database records and file-based logs with analytics queries

### 3.5 Gmail Integration

- **Purpose**: Automatically processes emails to extract URLs and add them to campaigns
- **Key Features**:
  - IMAP connection to Gmail
  - Email parsing with regex patterns
  - Whitelist filtering for secure operation
  - Auto-deletion of processed emails
- **Implementation**: Node.js IMAP client with mailparser for email content extraction

### 3.6 TrafficStar Integration

- **Purpose**: Connects campaigns to TrafficStar for spent value tracking and management
- **Key Features**:
  - API integration for campaign data
  - Daily spent value tracking
  - Budget updates at specified times
  - Campaign status synchronization
- **Implementation**: REST API client with OAuth 2.0 authentication

### 3.7 Traffic Generator

- **Purpose**: Enables intelligent routing based on campaign settings and spent values
- **Key Features**:
  - Spent value monitoring
  - Post-pause check functionality
  - Automatic budget updates
- **Implementation**: Background service with scheduled checks

## 4. Data Flow

### 4.1 Redirect Flow

1. User accesses a redirect URL (e.g., `/c/custom-path`)
2. Express.js backend receives the request and looks up the campaign by custom path
3. System selects an active URL from the campaign based on routing rules
4. The click is recorded in both database and log files
5. The high-performance redirect engine handles the redirect with the configured method
6. Click limits are checked and URL status is updated if needed

### 4.2 Campaign Management Flow

1. User creates or updates a campaign via the admin interface
2. Frontend sends API requests to the backend
3. Backend validates the request and stores campaign data in the database
4. If TrafficStar integration is enabled, campaign data is synchronized
5. URLs can be added to campaigns manually or via Gmail integration

### 4.3 Gmail Integration Flow

1. System periodically checks the configured Gmail account via IMAP
2. New emails matching the whitelist and pattern criteria are parsed
3. URLs are extracted and added to the specified campaign
4. Processed emails are optionally deleted after a configurable delay

### 4.4 TrafficStar Synchronization Flow

1. System periodically checks TrafficStar API for spent values
2. Spent values are recorded in the database
3. Budget updates are scheduled according to configured times
4. Traffic generator reacts to campaign status and spent values

## 5. External Dependencies

### 5.1 External Services

- **TrafficStar API**: Integration for campaign management and spent value tracking
- **Gmail IMAP**: Integration for automatic email processing and URL extraction

### 5.2 Library Dependencies

- **Frontend**:
  - React ecosystem (@radix-ui components)
  - Tailwind CSS for styling
  - Tanstack Query and Table for data fetching and display
  - Shadcn UI components
  
- **Backend**:
  - Express.js for HTTP server
  - Drizzle ORM for database access
  - IMAP and mailparser for email processing
  - SPDY for HTTP/2 support
  - Zod for validation
  - date-fns for date handling

## 6. Database Schema

The database schema is built around several key entities:

### 6.1 Main Entities

- **Campaigns**: Stores campaign configuration, including redirect methods, custom paths, and pricing
- **URLs**: Stores individual URLs with click limits, target URLs, and tracking data
- **TrafficStar Integration**: Tables for storing API credentials and campaign data from TrafficStar
- **Click Records**: Tables for tracking clicks and redirect events

### 6.2 Key Relationships

- One campaign can have many URLs (one-to-many)
- Campaigns may be linked to TrafficStar campaigns (one-to-one)
- URLs have click records associated with them (one-to-many)

### 6.3 Schema Protection

The system employs database triggers to protect click values from unauthorized modifications, particularly during automatic synchronization processes.

## 7. Security Considerations

- **Authentication**: Simple API key-based authentication for accessing management functions
- **Click Protection**: Database-level triggers to prevent unauthorized modification of click values
- **Email Security**: Whitelist-based filtering for Gmail integration to ensure only trusted sources
- **API Security**: Proper token management for TrafficStar API access
- **Environment Variables**: Sensitive values are stored in environment variables

## 8. Deployment Strategy

The application is configured for deployment on various platforms with considerations for:

- **Development Mode**: Local development with hot module reloading
- **Production Mode**: Optimized builds with minimized assets
- **Replit Deployment**: Special configuration for Replit hosting
- **Environment Configuration**: Different behavior based on NODE_ENV

The deployment process includes:
1. Building the frontend assets with Vite
2. Bundling the server code with esbuild
3. Running the production server which serves both the API and static assets

## 9. Scalability Considerations

- **Connection Pooling**: Database connections are managed through a connection pool
- **HTTP/2 Support**: Reduces connection overhead for multiple requests
- **Optimized Redirects**: High-performance redirect engine for handling large volumes of requests
- **File-Based Logging**: Separate file-based logs to reduce database load for high-volume events

## 10. Monitoring and Observability

- **Server Statistics**: Monitoring of CPU, memory, and network usage
- **Click Logging**: Detailed logging of click events with timestamps
- **Error Tracking**: Console logging of errors with stack traces
- **Performance Metrics**: Response time tracking and optimization