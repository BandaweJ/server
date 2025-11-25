# OpenAI Integration Setup

This document explains how to set up OpenAI integration for AI-generated student comments.

## Environment Configuration

Add the following environment variable to your `.env.development` and `.env.production` files:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

## Getting an OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and add it to your environment file

## Features

The OpenAI integration provides:

- **Dynamic Comment Generation**: AI generates contextual comments based on student marks
- **Fallback System**: If OpenAI is unavailable, the system uses predefined comments
- **Performance-Based Comments**: Comments are tailored to the student's performance level
- **Subject-Aware**: Comments can be customized based on the subject
- **Academic Level Aware**: Comments are appropriate for O Level or A Level students

## API Endpoint

The system exposes the following endpoint:

```
POST /ai/generate-comments
```

**Request Body:**
```json
{
  "mark": 85,
  "maxMark": 100,
  "subject": "Mathematics",
  "studentLevel": "O Level"
}
```

**Response:**
```json
{
  "success": true,
  "comments": [
    "Excellent work, keep it up",
    "Outstanding performance shown",
    "Superb effort and results",
    "Exceptional understanding demonstrated",
    "Continue this excellent standard"
  ]
}
```

## Security

- Only teachers, HODs, admins, and directors can access the comment generation endpoint
- JWT authentication is required
- Role-based access control is enforced

## Cost Considerations

- The system uses GPT-3.5-turbo model for cost efficiency
- Each request generates 5 comments with a maximum of 200 tokens
- Fallback comments are used when OpenAI is unavailable to ensure reliability

## Testing Without OpenAI Key

If no OpenAI API key is provided, the system will:
1. Log a warning message
2. Always return fallback comments based on mark ranges
3. Continue to function normally without AI features
