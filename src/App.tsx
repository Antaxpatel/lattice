import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Calculator from './pages/Calculator';
import Gpus from './pages/Gpus';
import Models from './pages/Models';
import Guide from './pages/Guide';
import Login from './pages/Login';
import History from './pages/History';
import Profiles from './pages/Profiles';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/calculator" element={<Calculator />} />
        <Route path="/gpus" element={<Gpus />} />
        <Route path="/models" element={<Models />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/login" element={<Login />} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/profiles" element={<ProtectedRoute><Profiles /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}
