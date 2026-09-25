import uvicorn
import os
from backend.app.config import HOST, PORT

if __name__ == "__main__":
    port = int(os.getenv("PORT", PORT))
    host = os.getenv("HOST", HOST)
    print(f"🚀 Starting TubeHarvest Pro server at http://{host}:{port}")
    uvicorn.run("backend.app.main:app", host=host, port=port, reload=False)
