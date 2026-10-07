/*
  Login con permisos minimos para CamarasWeb (reemplaza el uso de "sa" en appsettings.json).
  Solo puede ejecutar los 5 SPs que usa la web (visor + registrar camaras); no puede leer tablas,
  borrar, ni tocar otras bases.
  Ejecutar en SERVIDOR_SQL\INSTANCIA con un usuario administrador.
  >>> Cambie la clave antes de ejecutar y use la misma en appsettings.json (ConexionCAMARAS) <<<
*/
USE [master];
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'camaras_web')
    CREATE LOGIN [camaras_web] WITH PASSWORD = N'CAMBIAR_ESTA_CLAVE', CHECK_POLICY = ON, DEFAULT_DATABASE = [CAMARAS];
GO

USE [CAMARAS];
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'camaras_web')
    CREATE USER [camaras_web] FOR LOGIN [camaras_web];
GO

GRANT EXECUTE ON OBJECT::dbo.spGetCamarasxMonitor_DAHUA_AXIS TO [camaras_web];  -- visor
GRANT EXECUTE ON OBJECT::dbo.spGetSucursales                  TO [camaras_web];  -- registrar.html
GRANT EXECUTE ON OBJECT::dbo.spGetSucursalesxId               TO [camaras_web];
GRANT EXECUTE ON OBJECT::dbo.spInsertCamaraDahuaAxis          TO [camaras_web];
GRANT EXECUTE ON OBJECT::dbo.spUpdateCamaraDahuaAxis          TO [camaras_web];
GO

/* Prueba rapida (debe devolver las camaras del monitor 1 en el orden en que se muestran):
EXECUTE AS LOGIN = 'camaras_web';
EXEC dbo.spGetCamarasxMonitor_DAHUA_AXIS @monitor = 1;
REVERT;
*/
