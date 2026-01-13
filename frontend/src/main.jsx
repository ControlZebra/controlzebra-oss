import React from 'react'
import ReactDOM from 'react-dom/client'
import { setChonkyDefaults } from 'chonky'
import { ChonkyIconFA } from 'chonky-icon-fontawesome'
import App from './App'
import './index.css'

// Set Chonky defaults (icon component)
setChonkyDefaults({ iconComponent: ChonkyIconFA })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
