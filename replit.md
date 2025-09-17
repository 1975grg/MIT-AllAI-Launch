# AllAI Property Management Platform

## Overview
AllAI Property is a comprehensive property management platform designed for part-time landlords and small property management companies. It enables users to track properties, manage tenants, monitor maintenance issues, handle expenses, and stay organized with automated reminders. The platform aims to provide an intuitive interface for managing real estate portfolios, including features like ownership entity management, smart case tracking, and automated regulatory compliance.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, using Vite for building.
- **Routing**: Wouter for client-side routing, including protected routes.
- **UI Framework**: shadcn/ui components built on Radix UI primitives, styled with Tailwind CSS (light/dark mode support).
- **State Management**: TanStack Query for server state management and caching.
- **Forms**: React Hook Form with Zod for type-safe validation.

### Backend Architecture
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM for type-safe database operations.
- **Authentication**: Replit Auth (OpenID Connect) via Passport.js.
- **Session Management**: Express sessions with PostgreSQL store.
- **Background Jobs**: Node-cron for scheduled tasks.
- **API Design**: RESTful API with consistent error handling.

### Database Design
- **Primary Database**: PostgreSQL via Neon serverless driver.
- **Schema Management**: Drizzle migrations.
- **Key Entities**: Users, Organizations, Properties, Tenants, Leases, Units, Smart Cases, Financial transactions, and Automated reminders.
- **Relationships**: Complex many-to-many relationships, especially for properties and ownership entities.

### Authentication & Authorization
- **Provider**: Replit Auth using OpenID Connect.
- **Session Storage**: PostgreSQL-backed sessions.
- **Protection**: Middleware-based authentication on client and server.
- **User Management**: Automatic user creation and organization assignment.

### Development & Deployment
- **Build System**: Vite for frontend, esbuild for backend production builds.
- **Type Safety**: Shared TypeScript types across frontend and backend.

## External Dependencies

### Core Framework Dependencies
- **@neondatabase/serverless**: PostgreSQL driver.
- **drizzle-orm**: Type-safe ORM.
- **express**: Web application framework.
- **@tanstack/react-query**: Server state management.
- **react-hook-form**: Form state management.
- **zod**: Schema validation.

### UI & Styling Dependencies
- **@radix-ui/***: Accessible UI primitives.
- **tailwindcss**: Utility-first CSS framework.
- **class-variance-authority**: Component variant utility.
- **lucide-react**: Icon library.

### Authentication & Session Management
- **passport**: Authentication middleware.
- **openid-client**: OpenID Connect client.
- **express-session**: Session middleware.
- **connect-pg-simple**: PostgreSQL session store.

### Development & Build Tools
- **vite**: Frontend build tool.
- **tsx**: TypeScript execution.
- **esbuild**: JavaScript bundler.
- **@replit/vite-plugin-runtime-error-modal**: Development error handling.
- **@replit/vite-plugin-cartographer**: Replit-specific dev tools.

### Utility Libraries
- **node-cron**: Cron job scheduler.
- **date-fns**: Date utility library.
- **clsx**: Conditional className utility.
- **memoizee**: Function memoization.