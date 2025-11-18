# Code Execution Setup Guide

This guide covers how to set up and run the multi-language code execution system in Mimir.

## Overview

The code execution system supports:
- **Python**: Client-side execution via Pyodide (WebAssembly) with multi-file support
- **C, C++, Java, Rust**: Server-side execution with Docker sandboxing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              CodeWorkspace Component                 │    │
│  │                                                      │    │
│  │  ┌──────────────┐        ┌──────────────────────┐   │    │
│  │  │   Python     │        │ C/C++/Java/Rust      │   │    │
│  │  │   ↓          │        │   ↓                  │   │    │
│  │  │ Pyodide      │        │ Backend API          │   │    │
│  │  │ (Browser)    │        │ /execute             │   │    │
│  │  └──────────────┘        └──────────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backend (FastAPI)                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              /execute Endpoint                       │    │
│  │                      ↓                               │    │
│  │  ┌──────────────────────────────────────────────┐   │    │
│  │  │         Docker Sandbox Container              │   │    │
│  │  │  • gcc/g++ (C/C++)                           │   │    │
│  │  │  • javac/java (Java)                         │   │    │
│  │  │  • rustc (Rust)                              │   │    │
│  │  │  • Memory: 128MB, CPU: 1, PIDs: 50           │   │    │
│  │  │  • Network: Disabled                         │   │    │
│  │  └──────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Setup Instructions

### 1. Frontend Setup

No additional setup required for Python execution (runs in browser).

Add to your `.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8001
```

### 2. Backend Setup

#### Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

Add these dependencies to `requirements.txt` if not present:

```
docker>=6.0.0
```

#### Environment Variables

Add to `backend/.env`:

```env
# Execution settings
EXECUTION_DOCKER_IMAGE=mimir-executor:latest
EXECUTION_MEMORY_LIMIT=128m
EXECUTION_CPU_LIMIT=1
EXECUTION_PIDS_LIMIT=50
```

### 3. Docker Setup (Required for C/C++/Java/Rust)

#### Option A: Build the Docker Image

Create `backend/Dockerfile.executor`:

```dockerfile
FROM ubuntu:22.04

# Install compilers and runtime
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    default-jdk \
    rustc \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 executor

# Set working directory
WORKDIR /project

USER executor
```

Build the image:

```bash
cd backend
docker build -f Dockerfile.executor -t mimir-executor:latest .
```

#### Option B: Use Pre-built Image

If you prefer a pre-built image with all compilers:

```bash
docker pull gcc:latest  # For C/C++ only
# OR create a custom image with all languages
```

### 4. Security Considerations

The Docker sandbox provides multiple layers of protection:

| Protection | Setting | Purpose |
|------------|---------|---------|
| Network Isolation | `--network none` | Prevents network access |
| Memory Limit | `--memory 128m` | Prevents memory exhaustion |
| CPU Limit | `--cpus 1` | Prevents CPU hogging |
| Process Limit | `--pids-limit 50` | Prevents fork bombs |
| Read-only FS | `--read-only` | Prevents file system modifications |
| Non-root User | `--user 1000:1000` | Limits system access |
| Temp FS | `--tmpfs /tmp:rw,size=64m` | Writable temp with size limit |

#### Additional Security Recommendations

1. **Never run the backend as root**
2. **Use a dedicated Docker network** for the execution service
3. **Monitor resource usage** with Docker stats
4. **Consider gVisor or Firecracker** for production deployments

### 5. Running the System

#### Start the Backend

```bash
cd backend
uvicorn main:app --reload --port 8001
```

#### Start the Frontend

```bash
cd frontend
npm run dev
```

### 6. Testing Code Execution

#### Test Python (Multi-file)

1. Create a code instance
2. Add two files:
   - `main.py`:
     ```python
     from utils import greet
     print(greet("World"))
     ```
   - `utils.py`:
     ```python
     def greet(name):
         return f"Hello, {name}!"
     ```
3. Run `main.py` - should print "Hello, World!"

#### Test C

1. Create `main.c`:
   ```c
   #include <stdio.h>

   int main() {
       printf("Hello from C!\n");
       return 0;
   }
   ```
2. Run - should compile and print "Hello from C!"

#### Test C++

1. Create `main.cpp`:
   ```cpp
   #include <iostream>

   int main() {
       std::cout << "Hello from C++!" << std::endl;
       return 0;
   }
   ```
2. Run - should compile and print "Hello from C++!"

#### Test Java

1. Create `Main.java`:
   ```java
   public class Main {
       public static void main(String[] args) {
           System.out.println("Hello from Java!");
       }
   }
   ```
2. Run - should compile and print "Hello from Java!"

#### Test Rust

1. Create `main.rs`:
   ```rust
   fn main() {
       println!("Hello from Rust!");
   }
   ```
2. Run - should compile and print "Hello from Rust!"

### 7. Troubleshooting

#### Docker Not Available

If Docker is not available, the system falls back to local execution (less secure). You'll see a warning in the logs:

```
WARNING: Docker not available, falling back to local execution (less secure)
```

To fix:
1. Install Docker: https://docs.docker.com/get-docker/
2. Start Docker daemon
3. Build the executor image (see Setup step 3)

#### Compilation Errors

Check the compilation output in the console. Common issues:
- Missing headers (C/C++)
- Syntax errors
- Missing main function

#### Timeout Errors

Default timeout is 30 seconds. For longer-running programs:
- Increase timeout in `CodeWorkspace.tsx`
- Add `timeout` parameter to API requests

#### Memory Errors

If programs run out of memory:
- Increase `EXECUTION_MEMORY_LIMIT` in `.env`
- Optimize your code to use less memory

### 8. API Reference

#### POST /execute

Execute code in a sandboxed environment.

**Request:**
```json
{
  "language": "cpp",
  "entryPoint": "main.cpp",
  "files": [
    {
      "path": "main.cpp",
      "content": "#include <iostream>\nint main() { std::cout << \"Hello\"; }"
    }
  ],
  "timeout": 30000
}
```

**Response:**
```json
{
  "status": "success",
  "stdout": "Hello",
  "stderr": "",
  "executionTime": 1234.56,
  "compilationOutput": "main.cpp: In function 'int main()':\n..."
}
```

**Status Values:**
- `success`: Code executed successfully
- `error`: Compilation or runtime error
- `timeout`: Execution exceeded timeout

### 9. Language-Specific Notes

#### Python
- Runs in browser via Pyodide
- Supports `import` from other project files
- Use `micropip` to install packages
- Some native packages may not be available

#### C
- Compiled with `gcc`
- Links with `-lm` for math library
- All `.c` files compiled together

#### C++
- Compiled with `g++ -std=c++17`
- All `.cpp`, `.cc`, `.cxx` files compiled together

#### Java
- Main class determined from entry point filename
- All `.java` files compiled together
- Output goes to `/tmp` directory

#### Rust
- Single-file compilation with `rustc`
- Multi-file projects require Cargo (future enhancement)

### 10. Future Enhancements

- [ ] SSE streaming for real-time output
- [ ] Container pooling for faster cold starts
- [ ] Cargo support for Rust projects
- [ ] Package manager support (npm, pip in sandbox)
- [ ] Input/stdin support
- [ ] Debugging support

## File Structure

```
backend/
├── main.py                      # FastAPI app with /execute endpoint
├── execution/
│   ├── __init__.py
│   ├── models.py                # ExecuteRequest/Response models
│   ├── executor.py              # Main executor routing
│   ├── sandbox.py               # Docker sandbox utilities
│   └── languages/
│       ├── __init__.py
│       ├── c_executor.py
│       ├── cpp_executor.py
│       ├── java_executor.py
│       └── rust_executor.py
└── Dockerfile.executor          # Docker image for execution

frontend/
├── workers/
│   └── python.worker.ts         # Pyodide worker with VFS support
├── components/code/
│   ├── CodeWorkspace.tsx        # Main workspace with language routing
│   └── OutputConsole.tsx        # Console with compilation output
└── lib/
    ├── types.ts                 # TypeScript types
    └── api/
        └── execute.ts           # Backend API client
```
