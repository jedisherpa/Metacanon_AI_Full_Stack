# DEPLOYMENT GUIDE: THE VISIONARY PATH (HYBRID ARCHITECTURE)

**Deploying the Sovereign AI Platform on a Two-Server Setup**

*Author: Manus AI | Date: February 2026*

---

## Overview

This guide details the "Visionary Path" — a professional, scalable, two-server architecture. This setup provides production-grade performance by dedicating a powerful GPU server to LLM inference while running the core platform on a separate, cost-effective cloud server.

*   **Server 1 (The "Brain"):** A low-cost Hetzner **CPX21** cloud server. It will run the Sovereign AI Platform's Core Engine.
*   **Server 2 (The "Oracle"):** A powerful Hetzner **GEX44** dedicated GPU server. It will run Ollama and serve the LLM.

This separation is the standard for real-world AI applications. It allows you to scale, update, and manage each component independently.

---

## PHASE 1: PROVISIONING THE SERVERS (30 Minutes)

Your first step is to rent both servers from Hetzner.

### 1.1: Rent the Platform Server (CPX21)

1.  Go to [Hetzner Cloud](https://www.hetzner.com/cloud).
2.  Create a new project and add a server.
3.  **Location:** Choose a location (e.g., Falkenstein, Germany).
4.  **Image:** Select **Ubuntu 22.04**.
5.  **Type:** Select **Standard** and choose the **CPX21** plan (~$10/mo).
6.  **Networking:** Keep defaults.
7.  **SSH Key:** **CRITICAL:** Add your SSH public key. This is how you will log in. If you don't have one, follow Hetzner's [excellent guide](https://community.hetzner.com/tutorials/how-to-generate-ssh-key) to create one.
8.  **Name:** Name it `sovereign-brain`.
9.  Click **Create & Buy Now**.

Hetzner will provision the server and give you its IP address. **Save this IP address.**

### 1.2: Rent the LLM Server (GEX44)

1.  Go to the [Hetzner Dedicated Server](https://www.hetzner.com/dedicated-rootserver/matrix-gpu/) page.
2.  Find the **GEX44** server and click **Order**.
3.  Follow the checkout process. You will select **Ubuntu 22.04** as the operating system.
4.  During setup, you will be asked to provide an SSH key, just as you did for the cloud server.
5.  Complete the order. Hetzner will email you when the server is ready with its IP address. **Save this IP address.**

---

## PHASE 2: CONFIGURING THE LLM SERVER (THE ORACLE)

First, we set up the GPU server. You will need the IP address and the SSH key you used to create it.

### 2.1: Connect to the Server

Open a terminal on your local machine:

```bash
# Replace YOUR_GEX44_IP with the actual IP address
ssh root@YOUR_GEX44_IP
```

### 2.2: Install NVIDIA Drivers

This is the most critical step on the GPU server.

```bash
# Update your system
sudo apt update && sudo apt upgrade -y

# Install the NVIDIA drivers
sudo apt install -y nvidia-driver-550

# Reboot the server for the drivers to load
sudo reboot
```

Wait a minute or two, then reconnect via SSH. Verify the installation by running `nvidia-smi`. You should see a table detailing your NVIDIA RTX 4000 GPU.

### 2.3: Install and Run Ollama

Ollama provides a simple, one-line installation.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
```

By default, Ollama only accepts connections from the local machine. We need to configure it to be accessible from your *other* server.

1.  Edit the Ollama systemd service:
    ```bash
    sudo systemctl edit ollama.service
    ```
2.  This will open a blank text editor. Paste the following lines into it:
    ```ini
    [Service]
    Environment="OLLAMA_HOST=0.0.0.0"
    ```
3.  Save and close the file (Ctrl+X, then Y, then Enter).
4.  Reload the configuration and restart Ollama:
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl restart ollama
    ```

### 2.4: Pull Your First Model

Now, pull a model. We recommend starting with Mistral 7B.

```bash
# This will download the model, which may take a few minutes
ollama pull mistral
```

Your Oracle is now ready. It is running Ollama on port 11434, accessible from anywhere, and has the Mistral model ready to serve.

---

## PHASE 3: DEPLOYING THE PLATFORM (THE BRAIN)

Now, switch to your *other* terminal window and configure the CPX21 server.

### 3.1: Connect and Secure the Server

Follow the same security steps from the previous guide: connect as `root`, create a new user, give it sudo privileges, and log in as that new user.

```bash
# Replace YOUR_CPX21_IP with the actual IP address
ssh root@YOUR_CPX21_IP

# Create a new user (e.g., 'sovereign')
adduser sovereign
usermod -aG sudo sovereign

# Log out and log back in as the new user
exit
ssh sovereign@YOUR_CPX21_IP
```

### 3.2: Install Docker and Git

```bash
# Install Docker
sudo apt update
sudo apt install -y docker.io docker-compose

# Add your user to the docker group to avoid using sudo for docker commands
sudo usermod -aG docker ${USER}

# Log out and log back in for the group change to take effect
exit
ssh sovereign@YOUR_CPX21_IP

# Install Git
sudo apt install -y git
```

### 3.3: Clone and Deploy the Platform

Now you clone your repository and run it, pointing it to your new LLM server.

```bash
# Clone your repository
git clone https://github.com/jedisherpa/Sovereign-AI-Platform.git

# Navigate into the directory
cd Sovereign-AI-Platform

# CRITICAL: Set the LLM_HOST environment variable before deploying
# Replace YOUR_GEX44_IP with the IP of your GPU server
export LLM_HOST="http://YOUR_GEX44_IP:11434"

# Launch the platform!
docker-compose up --build -d
```

Your Sovereign AI Platform is now running. The Core Engine is live on port 8080.

---

## PHASE 4: VERIFICATION

From the CPX21 server (`sovereign-brain`), test the connection to the Core Engine:

```bash
curl http://localhost:8080/health
# Expected: {"status":"ok",...}
```

Now, the real test. Send a deliberation request. This will make the Core Engine on the CPX21 server call out across the internet to the GEX44 GPU server, get a response from the LLM, and return the result.

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"query": "What is the nature of consciousness?"}' \
  http://localhost:8080/deliberate
```

You should see a fully-formed JSON response where the `content` fields are populated by the Mistral model running on your dedicated GPU server. You have successfully deployed a high-performance, distributed AI platform.
