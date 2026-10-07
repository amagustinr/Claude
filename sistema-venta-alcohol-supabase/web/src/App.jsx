import { Navigate, Route, Routes } from 'react-router-dom'
import { useSesion } from './sesion.jsx'
import Layout from './componentes/Layout.jsx'
import { Cargando } from './componentes/Comunes.jsx'
import Login from './paginas/Login.jsx'
import Inicio from './paginas/Inicio.jsx'
import NuevaVenta from './paginas/NuevaVenta.jsx'
import Ventas from './paginas/Ventas.jsx'
import Documento from './paginas/Documento.jsx'
import Productos from './paginas/Productos.jsx'
import ProductoEditar from './paginas/ProductoEditar.jsx'
import Categorias from './paginas/Categorias.jsx'
import Stock from './paginas/Stock.jsx'
import Kardex from './paginas/Kardex.jsx'
import Clientes from './paginas/Clientes.jsx'
import ClienteEditar from './paginas/ClienteEditar.jsx'
import Usuarios from './paginas/Usuarios.jsx'
import Configuracion from './paginas/Configuracion.jsx'
import CambiarClave from './paginas/CambiarClave.jsx'

// Equivale a [Authorize(Roles = "Administrador")]. Es solo para la navegación:
// la protección real de los datos está en las políticas RLS de Supabase.
function SoloAdmin({ children }) {
  const { esAdmin } = useSesion()
  return esAdmin ? children : (
    <div className="alert alert-warning">No tiene permiso para ver esta página.</div>
  )
}

export default function App() {
  const { cargando, sesion, perfil } = useSesion()
  if (cargando) return <Cargando />
  if (!sesion || !perfil) return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/ventas/nueva" element={<NuevaVenta />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/ventas/:id" element={<Documento />} />
        <Route path="/productos" element={<Productos />} />
        <Route path="/productos/nuevo" element={<SoloAdmin><ProductoEditar /></SoloAdmin>} />
        <Route path="/productos/:id" element={<SoloAdmin><ProductoEditar /></SoloAdmin>} />
        <Route path="/categorias" element={<SoloAdmin><Categorias /></SoloAdmin>} />
        <Route path="/stock" element={<SoloAdmin><Stock /></SoloAdmin>} />
        <Route path="/kardex" element={<SoloAdmin><Kardex /></SoloAdmin>} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/nuevo" element={<ClienteEditar />} />
        <Route path="/clientes/:id" element={<ClienteEditar />} />
        <Route path="/usuarios" element={<SoloAdmin><Usuarios /></SoloAdmin>} />
        <Route path="/configuracion" element={<SoloAdmin><Configuracion /></SoloAdmin>} />
        <Route path="/cambiar-clave" element={<CambiarClave />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
