##  **BioExplore 3D**

BioExplore 3D is an interactive comparative biology and anatomy learning website. It combines 3D anatomical models, species information, a searchable biodiversity catalogue, guided learning modules, and an AI biology tutor.

## Main Features
### 1. Home
- Introduces the BioExplore 3D platform.
- Highlights selected species and provides entry points to the main learning tools.
- Allows users to start exploring a specimen, search for species, or open the Learning Center.

### 2. 3D Explorer
- Displays interactive 3D anatomy models.
- Supports selecting anatomical systems and individual structures when model metadata is available.
- Provides controls for viewing, isolating, and examining anatomical parts.
- Includes species-specific information and an anatomy inspector.
- Includes the BioAI Biology Tutor, which can answer questions in English, Sinhala, and Singlish.

### 3. Species Search
- Searches the built-in species and taxonomy catalogue.
- Supports filtering by animal group.
- Combines internal catalogue results with external biodiversity and 3D-model sources where available.
- Distinguishes between species with interactive 3D models and records that provide information only.

### 4. Learning Center
- Provides guided comparative-anatomy learning modules.
- Connects learning topics to relevant species and the 3D Explorer.
- Covers comparative topics such as circulatory systems, respiratory systems, carnivore anatomy, and aquatic-animal anatomy.

### 5. Manage Library
- Allows administrators to add and edit custom species records.
- Supports uploading `.glb` and `.gltf` 3D model files.
- Allows anatomical systems and part metadata to be associated with uploaded models.
- Supports deleting custom library entries.

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS
- **3D rendering:** Three.js
- **Icons and animation:** Lucide React and Motion
- **Backend:** Node.js, Express, TypeScript
- **AI integration:** Google Gemini API through `@google/genai`
- **File uploads:** Multer
- **External information sources:** GBIF, Wikipedia, and external 3D model search services

## Project Structure

```text
bioexplore-3d/
├── public/
│   ├── models/              # Bundled 3D models
│   ├── draco/               # Draco decoder assets
│   └── assets/              # Public images and assets
├── src/
│   ├── assets/              # Application images
│   ├── components/
│   │   ├── HomePage.tsx
│   │   ├── ExplorerWorkspace.tsx
│   │   ├── AnatomyViewer3D.tsx
│   │   ├── SpeciesSearchPage.tsx
│   │   ├── LearningCenterPage.tsx
│   │   ├── AdminLibraryPage.tsx
│   │   └── BioAIPanel.tsx
│   ├── data/                # Curated species and global catalogue data
│   ├── three/               # 3D model loading utilities
│   ├── types/               # TypeScript data types
│   ├── App.tsx
│   └── main.tsx
├── server.ts                # Express API and Vite development server
├── package.json
├── vite.config.ts
└── .env.example
```

## Requirements

Install the following before running the project:

- Node.js (a current LTS version is recommended)
- npm
- A Google Gemini API key for AI tutor functionality

## Installation and Setup

1. Extract or clone the project and open its root directory in a terminal.
2. Install the dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root (or copy `.env.example` to `.env`).
4. Add your Gemini API key:

   ```env
   GEMINI_API_KEY=your_gemini_api_key
   ```

   `APP_URL` is included in the example environment file for hosted deployments. Set it to the deployed application URL when the hosting setup requires it.

5. Start the application:

   ```bash
   npm run dev
   ```

6. Open the local address shown in the terminal. The server is configured to use port `3000`.

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Starts the Express server and Vite development environment. |
| `npm run build` | Builds the frontend for production. |
| `npm run preview` | Runs Vite's production preview server. |
| `npm run lint` | Runs the TypeScript compiler in no-emit checking mode. |
| `npm run clean` | Removes the generated `dist` directory and `server.js`. |

## Backend API Overview

The Express server provides the following API routes:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Checks server health. |
| `GET` | `/api/species` | Returns the available species library and index count. |
| `GET` | `/api/species/:id` | Returns a species record by ID. |
| `GET` | `/api/species-info` | Retrieves additional species information. |
| `POST` | `/api/species-anatomy-details` | Requests anatomy details for a species. |
| `GET` | `/api/search` | Searches species and connected external sources. |
| `POST` | `/api/admin/species` | Creates a custom species record and optionally uploads a model. |
| `PUT` | `/api/admin/species/:id` | Updates a custom species record and optionally its model. |
| `DELETE` | `/api/admin/species/:id` | Deletes a custom species record. |
| `POST` | `/api/bioai/chat` | Sends a question to the BioAI tutor. |

## Data and File Storage

- The bundled curated species data is stored in `src/data/`.
- Custom species metadata is stored by the server in `data/custom-species.json`.
- Uploaded 3D models are stored in `uploads/models/`.
- The server creates the `data/` and `uploads/models/` directories automatically when it starts.
- Keep backups of these directories if custom records and uploaded models must be retained.

**Deployment note:** The project currently uses local filesystem storage for custom records and uploaded models. A hosting platform with an ephemeral filesystem may not retain these files after redeployment or restart. Use persistent storage or migrate the data and models to a managed database/object-storage service for production deployments.

## AI Tutor Configuration

BioAI uses the Google Gemini API. Configure `GEMINI_API_KEY` in the server environment before using AI chat. Keep the key private:
- Do not commit `.env` to source control.
- Do not place the API key in frontend code.
- If the key is exposed, replace it in the provider console.

The website's AI tutor interface supports English, Sinhala, and Singlish. AI responses require a working network connection and a valid API key.

## 3D Model Notes

- The project includes bundled 3D model assets under `public/models/`.
- Custom model uploads accept `.glb` and `.gltf` files.
- The upload endpoint has an 80 MB file-size limit.
- For useful part-level exploration, provide model metadata describing anatomical systems and parts. A model file alone may not contain all the educational labels or explanations needed by the interface.
- Respect the license and attribution requirements of every model obtained from an external source.

## Troubleshooting

**BioAI does not respond**
- Confirm that `GEMINI_API_KEY` is set correctly in the server environment.
- Restart the development server after changing `.env`.
- Check the terminal output and browser network console for API errors.

**A 3D model does not appear**
- Confirm that the model file is a valid `.glb` or `.gltf`.
- Check that all required model resources are available.
- Inspect the browser console for loading or WebGL errors.
- For external models, check whether the source permits access and embedding.

**Custom species disappear after deployment**
- Confirm that `data/custom-species.json` and `uploads/models/` are stored on persistent storage.
- The default implementation saves these files locally rather than in a hosted database.

**Dependencies or TypeScript errors**
- Run `npm install` again.
- Run `npm run lint` to identify TypeScript issues.
- Check that the installed Node.js version is compatible with the project dependencies.

## Notes

This project is an educational biology and comparative-anatomy tool. Species information and AI-generated explanations are intended to support learning and should be checked against trusted educational or scientific references when accuracy is important.