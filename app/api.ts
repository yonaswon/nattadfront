// api.ts - Axios instance with baseURL pointing to Django backend
// Usage: import api from './api'
// All API requests should use this instance

import axios from 'axios';

const api = axios.create({
    // baseURL: 'http://localhost:8000/api',
    baseURL: 'https://nattad.duckdns.org/api',

    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
