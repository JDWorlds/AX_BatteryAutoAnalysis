import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import './App.css'
import SimulationDashboard from './component/SimulationDash/simulationDashboard';
import Home from './component/Home';

function App() {
  const [count, setCount] = useState(0)

  return (
    <Router>
        <Routes>
          <Route path='/' element={<Home/>} />
          <Route path="/dash" element={<SimulationDashboard />} />
        </Routes>
    </Router>
  )
}

export default App
