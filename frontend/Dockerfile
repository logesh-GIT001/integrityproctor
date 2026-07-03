FROM node:18-alpine

WORKDIR /app

# Copy package configurations
COPY frontend/package.json frontend/package-lock.json /app/frontend/
WORKDIR /app/frontend

# Install dependencies using clean install
RUN npm ci

# Copy the frontend codebase
COPY frontend/ /app/frontend/

# Expose Next.js dev server port
EXPOSE 3000

# Run Next.js dev server
CMD ["npm", "run", "dev", "--", "-p", "3000"]
