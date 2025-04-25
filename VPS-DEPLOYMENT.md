# Deploying to Ubuntu 22.04 VPS

This guide will help you deploy the URL Management System from Replit to your Ubuntu 22.04 VPS in one click.

## Prerequisites

1. A fresh Ubuntu 22.04 VPS with root access
2. SSH access to the VPS
3. The following ports open on your VPS:
   - 22 (SSH)
   - 80 (HTTP)
   - 443 (HTTPS, for future use)

## Deployment Steps

### 1. Make the deployment script executable

```bash
chmod +x deploy-to-vps.sh
```

### 2. Run the deployment script

```bash
./deploy-to-vps.sh <VPS_IP> [SSH_PORT] [SSH_USER]
```

Where:
- `<VPS_IP>` is the IP address of your Ubuntu VPS (required)
- `[SSH_PORT]` is the SSH port (default: 22)
- `[SSH_USER]` is the SSH user (default: root)

Example:
```bash
./deploy-to-vps.sh 123.456.789.012
```

Or if you have a custom SSH port and user:
```bash
./deploy-to-vps.sh 123.456.789.012 2222 ubuntu
```

### 3. What the script does

The deployment script performs the following actions:

1. Packages your application files and database from Replit
2. Transfers them to your VPS
3. Sets up the necessary environment on your VPS:
   - Installs Node.js 20.x
   - Installs PostgreSQL
   - Installs Nginx
   - Configures the database
   - Sets up environment variables
4. Restores your database with all data
5. Installs dependencies and builds your application
6. Creates a systemd service to run your application
7. Configures Nginx as a reverse proxy
8. Starts your application

### 4. Accessing your application

Once the deployment is complete, you can access your application at:

```
http://<VPS_IP>
```

## Post-Deployment Configuration

### Setting up a domain name

1. Configure your domain's DNS to point to your VPS IP address
2. Update the Nginx configuration to use your domain:

```bash
sudo nano /etc/nginx/sites-available/url-management
```

Change `server_name _;` to `server_name yourdomain.com www.yourdomain.com;`

3. Save and reload Nginx:

```bash
sudo systemctl reload nginx
```

### Setting up SSL with Let's Encrypt

1. Install Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
```

2. Obtain and install SSL certificate:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

3. Follow the prompts to complete the setup

### Monitoring and maintenance

- Check application status:
```bash
sudo systemctl status url-management
```

- View application logs:
```bash
sudo journalctl -u url-management
```

- Restart the application:
```bash
sudo systemctl restart url-management
```

## Troubleshooting

If you encounter any issues during or after deployment:

1. Check the application logs:
```bash
sudo journalctl -u url-management
```

2. Check Nginx logs:
```bash
sudo tail /var/log/nginx/error.log
```

3. Ensure the database is running:
```bash
sudo systemctl status postgresql
```

4. Verify that all environment variables are set correctly:
```bash
cat /etc/environment
```