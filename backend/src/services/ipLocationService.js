const https = require('https');
const http = require('http');

class IPLocationService {
    /**
     * Get location from IP address using free IP geolocation API
     * @param {string} ipAddress - IP address to lookup
     * @returns {Promise<string>} Location string (City, State, Country)
     */
    async getLocationFromIP(ipAddress) {
        if (!ipAddress || ipAddress === '::1' || ipAddress === '127.0.0.1') {
            return 'Local/Unknown';
        }

        try {
            // Use ip-api.com (free, no API key required, 45 requests/minute)
            const url = `http://ip-api.com/json/${ipAddress}?fields=status,message,country,regionName,city,query`;
            
            return new Promise((resolve, reject) => {
                http.get(url, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            
                            if (result.status === 'success') {
                                const locationParts = [];
                                if (result.city) locationParts.push(result.city);
                                if (result.regionName) locationParts.push(result.regionName);
                                if (result.country) locationParts.push(result.country);
                                
                                const location = locationParts.length > 0 
                                    ? locationParts.join(', ') 
                                    : 'Unknown Location';
                                
                                console.log(`Location found for IP ${ipAddress}: ${location}`);
                                resolve(location);
                            } else {
                                console.warn(`IP geolocation failed for ${ipAddress}: ${result.message || 'Unknown error'}`);
                                resolve('Unknown Location');
                            }
                        } catch (error) {
                            console.error('Error parsing IP geolocation response:', error);
                            resolve('Unknown Location');
                        }
                    });
                }).on('error', (error) => {
                    console.error('Error fetching IP geolocation:', error);
                    resolve('Unknown Location');
                }).setTimeout(5000, () => {
                    console.warn('IP geolocation request timeout');
                    resolve('Unknown Location');
                });
            });
        } catch (error) {
            console.error('IP location service error:', error);
            return 'Unknown Location';
        }
    }

    /**
     * Extract IP address from request
     * @param {Object} req - Express request object
     * @returns {string} IP address
     */
    getClientIP(req) {
        // Check various headers for real IP (when behind proxy/load balancer)
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            // X-Forwarded-For can contain multiple IPs, take the first one
            const ip = forwarded.split(',')[0].trim();
            if (ip) return ip;
        }

        const realIP = req.headers['x-real-ip'];
        if (realIP) return realIP;

        // Fallback to connection remote address
        return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || 'Unknown';
    }
}

module.exports = new IPLocationService();








