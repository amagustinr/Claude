import { Link, NavLink } from 'react-router-dom'
import { useSesion } from '../sesion.jsx'

export default function Layout({ children }) {
  const { perfil, esAdmin, salir } = useSesion()
  const enlace = ({ isActive }) => 'nav-link' + (isActive ? ' active' : '')

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark mb-4">
        <div className="container">
          <Link className="navbar-brand" to="/"><i className="bi bi-cup-straw" /> Botillería</Link>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#menu">
            <span className="navbar-toggler-icon" />
          </button>
          <div className="collapse navbar-collapse" id="menu">
            <ul className="navbar-nav me-auto">
              <li className="nav-item"><NavLink className={enlace} to="/ventas/nueva"><i className="bi bi-cart-plus" /> Nueva venta</NavLink></li>
              <li className="nav-item"><NavLink className={enlace} to="/ventas" end>Ventas</NavLink></li>
              <li className="nav-item"><NavLink className={enlace} to="/productos">Productos</NavLink></li>
              <li className="nav-item"><NavLink className={enlace} to="/clientes">Clientes</NavLink></li>
              {esAdmin && (
                <li className="nav-item dropdown">
                  <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">Administración</a>
                  <ul className="dropdown-menu">
                    <li><Link className="dropdown-item" to="/stock">Movimientos de stock</Link></li>
                    <li><Link className="dropdown-item" to="/kardex">Kardex</Link></li>
                    <li><Link className="dropdown-item" to="/categorias">Categorías</Link></li>
                    <li><hr className="dropdown-divider" /></li>
                    <li><Link className="dropdown-item" to="/usuarios">Usuarios</Link></li>
                    <li><Link className="dropdown-item" to="/configuracion">Datos de la empresa</Link></li>
                  </ul>
                </li>
              )}
            </ul>
            <ul className="navbar-nav">
              <li className="nav-item dropdown">
                <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                  <i className="bi bi-person-circle" /> {perfil.nombre_completo}
                  <span className="badge bg-secondary ms-1">{esAdmin ? 'Administrador' : 'Vendedor'}</span>
                </a>
                <ul className="dropdown-menu dropdown-menu-end">
                  <li><Link className="dropdown-item" to="/cambiar-clave">Cambiar clave</Link></li>
                  <li><button className="dropdown-item" onClick={salir}>Cerrar sesión</button></li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </nav>
      <main className="container pb-5">{children}</main>
    </>
  )
}
