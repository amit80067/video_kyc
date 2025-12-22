module.exports = {
  apps: [
    {
      name: 'video-kyc-backend',
      script: './backend/src/server.js',
      cwd: '/home/ubuntu/video_kyc',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_file: './backend/.env',
      env: {
        NODE_ENV: 'production',
        PORT: 8005
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
  ]
};
