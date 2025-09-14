# AllAI Property Management Platform

## Overview

AllAI Property is a comprehensive property management platform designed for part-time landlords and small property management companies. The application helps users track properties, manage tenants, monitor maintenance issues, handle expenses, and stay organized with automated reminders. Built with a modern full-stack architecture, it provides an intuitive interface for managing real estate portfolios with features like ownership entity management, smart case tracking, and automated regulatory compliance reminders.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### Update 1: Property Naming & Unit Selection Consistency (September 2025)
**Checkpoint Name**: "Universal Property & Unit Interface Consistency"
**Quick Reference**: Update 1

**Summary**: Achieved complete consistency across all platform pages for property naming and building unit selection patterns.

**Changes Made**:
- **Property Display**: All pages now show property names (e.g., "St Pete") instead of addresses when available, with fallback to "${property.street}, ${property.city}" format
- **Building Unit Selection**: Standardized unit selection interface across all pages:
  - Maintenance, Tenants, Reminders pages: Checkbox-based filtering with "Common Area + individual units"
  - Expense forms: Radio button-based selection with "Common Area + individual units" in bordered boxes
- **Filtering Logic**: Implemented consistent unit filtering that works across all data types (cases, reminders, expenses, tenants)

**Files Modified**:
- `client/src/pages/maintenance.tsx` - Enhanced with consistent property naming
- `client/src/pages/tenants.tsx` - Added unit selection and consistent property display
- `client/src/pages/reminders.tsx` - Added unit selection and fixed property naming
- `client/src/pages/expenses.tsx` - Added unit selection and consistent property display
- `client/src/components/forms/expense-form.tsx` - Replaced dropdowns with radio buttons for unit selection
- `client/src/components/forms/tenant-form.tsx` - Consistent property naming
- `client/src/components/forms/reminder-form.tsx` - Consistent property naming

**UX Pattern Established**:
- Properties with multiple units (buildings) show unit selection interface
- Single-unit properties skip unit selection
- Checkboxes for multi-select filtering (page-level)
- Radio buttons for single-select form inputs (form-level)
- Consistent bordered box styling with explanatory text

**Significance**: This update ensures users see the same interface patterns and property naming conventions throughout the entire platform, eliminating confusion and improving user experience consistency.

### Update 2: Mailla GPT-5 Integration & Structured AI Responses (September 2025)
**Checkpoint Name**: "GPT-5 Mailla AI Assistant with Structured Responses"
**Quick Reference**: Update 2

**Summary**: Successfully integrated GPT-5 as the AI engine for Mailla, the property management assistant, with beautiful structured JSON responses optimized for time-efficient property analysis.

**Key Achievements**:
- **GPT-5 Integration**: Successfully integrated OpenAI's GPT-5 Responses API after resolving multiple API compatibility challenges
- **Structured Response Format**: Transformed verbose AI responses into concise, scannable format with visual hierarchy:
  - TL;DR summaries for quick insights
  - Bullet points with specific data and numbers  
  - Actionable items with timeframes
  - Visual components using shadcn UI for professional presentation
- **Context-Aware Analysis**: Implemented page-specific AI insights for Dashboard and Reminders pages
- **Robust Error Handling**: Added comprehensive JSON parsing, validation, and fallback systems

**Technical Challenges Resolved**:
- GPT-5 Responses API parameter structure (text.format vs response_format)
- Response parsing from multiple content fields (output_text, content, output arrays)
- Parameter compatibility (removed unsupported temperature parameter)
- Enhanced content extraction for consistent responses

**Files Modified**:
- `server/routes.ts` - GPT-5 Responses API integration with robust parsing
- `client/src/components/ai/property-assistant.tsx` - Structured response rendering
- `client/src/pages/dashboard.tsx` - Context-aware AI integration
- `client/src/pages/reminders.tsx` - Context-aware AI integration

**User Impact**: 
- Concise, visually appealing AI responses designed for busy part-time landlords
- Advanced GPT-5 reasoning for better property performance analysis
- Consistent structured format across all AI interactions
- Professional presentation matching the platform's design system

**Significance**: This update delivers on the core vision of Mailla as an integrated AI assistant that provides quick, actionable insights in a format optimized for efficient property management decision-making.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for client-side routing with protected routes based on authentication state
- **UI Framework**: shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Forms**: React Hook Form with Zod validation for type-safe form handling
- **Styling**: Tailwind CSS with CSS variables for theming, configured for both light and dark modes

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: Replit Auth (OpenID Connect) with Passport.js strategy
- **Session Management**: Express sessions with PostgreSQL store
- **Background Jobs**: Node-cron for scheduled tasks like reminder notifications
- **API Design**: RESTful API with consistent error handling and request logging

### Database Design
- **Primary Database**: PostgreSQL with Neon serverless driver
- **Schema Management**: Drizzle migrations with comprehensive schema definitions
- **Key Entities**: 
  - Users and Organizations with role-based access
  - Properties with ownership entity relationships
  - Tenants, Leases, and Units for rental management
  - Smart Cases for maintenance tracking
  - Financial transactions and expense categorization
  - Automated reminders with various triggers
- **Relationships**: Complex many-to-many relationships between properties and ownership entities, with proper foreign key constraints

### Authentication & Authorization
- **Provider**: Replit Auth using OpenID Connect protocol
- **Session Storage**: PostgreSQL-backed sessions with automatic cleanup
- **Route Protection**: Middleware-based authentication checks on both client and server
- **User Management**: Automatic user creation and organization assignment

### Development & Deployment
- **Build System**: Vite for frontend bundling with HMR support
- **Type Safety**: Shared TypeScript types between frontend and backend
- **Development Tools**: Runtime error overlays and Replit-specific development enhancements
- **Production Build**: esbuild for server bundling with external packages

## External Dependencies

### Core Framework Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL driver for database connections
- **drizzle-orm**: Type-safe ORM with PostgreSQL dialect support
- **express**: Web application framework for API routes and middleware
- **@tanstack/react-query**: Server state management and data fetching
- **react-hook-form**: Form state management with validation
- **zod**: Runtime type validation and schema definition

### UI & Styling Dependencies
- **@radix-ui/***: Accessible UI primitives for components like dialogs, dropdowns, and form controls
- **tailwindcss**: Utility-first CSS framework with custom theme configuration
- **class-variance-authority**: Utility for creating component variants
- **lucide-react**: Modern icon library for consistent iconography

### Authentication & Session Management
- **passport**: Authentication middleware with OpenID Connect strategy
- **openid-client**: OpenID Connect client implementation
- **express-session**: Session middleware for Express
- **connect-pg-simple**: PostgreSQL session store adapter

### Development & Build Tools
- **vite**: Frontend build tool with React plugin
- **tsx**: TypeScript execution environment for development
- **esbuild**: JavaScript bundler for production builds
- **@replit/vite-plugin-runtime-error-modal**: Development error handling
- **@replit/vite-plugin-cartographer**: Replit-specific development tools

### Utility Libraries
- **node-cron**: Cron job scheduler for automated tasks
- **date-fns**: Date utility library for formatting and manipulation
- **clsx**: Conditional className utility
- **memoizee**: Function memoization for performance optimization