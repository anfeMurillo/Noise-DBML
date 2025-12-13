# Detección de Anti-Patrones en DBML

La funcionalidad de detección de anti-patrones analiza automáticamente tu esquema DBML para identificar problemas comunes de diseño de base de datos y violaciones de mejores prácticas.

## 🚀 Cómo Usar

### Opción 1: Barra de Herramientas
1. Abre un archivo `.dbml`
2. Haz clic en el **icono de advertencia (⚠️)** en la barra de herramientas del editor

### Opción 2: Paleta de Comandos
1. Presiona `Ctrl+Shift+P` (o `Cmd+Shift+P` en Mac)
2. Escribe "DBML: Detect Anti-Patterns"
3. Presiona Enter

### Resultado
Se abrirá un documento nuevo con el reporte completo de anti-patrones detectados.

## 🔍 Anti-Patrones Detectados

### ❌ Errores (Alta Severidad)

#### 1. Tablas Vacías
**Descripción**: Tablas sin campos definidos.

**Ejemplo**:
```dbml
Table empty_table {
  // No fields defined!
}
```

**Recomendación**: Define al menos una columna o elimina la tabla si no es necesaria.

---

### ⚠️ Advertencias (Severidad Media-Alta)

#### 2. Tablas sin Clave Primaria
**Descripción**: Tablas que no tienen una clave primaria definida.

**Ejemplo**:
```dbml
Table users {
  username varchar(50)
  email varchar(100)
  created_at timestamp
}
```

**Problema**: Sin una clave primaria, es difícil identificar de manera única cada registro.

**Recomendación**: 
```dbml
Table users {
  id integer [pk, increment]  // ✅ Añadir PK
  username varchar(50)
  email varchar(100)
  created_at timestamp
}
```

---

#### 3. Demasiados Campos NULL
**Descripción**: Cuando más del 50% de los campos en una tabla permiten valores NULL.

**Ejemplo**:
```dbml
Table customer_data {
  id integer [pk, increment]
  name varchar(100)      // not null
  email varchar(100)     // nullable
  phone varchar(20)      // nullable
  address varchar(200)   // nullable
  city varchar(50)       // nullable
  state varchar(50)      // nullable
  zip_code varchar(10)   // nullable
  country varchar(50)    // nullable
  // 7 de 8 campos son nullable (87%)
}
```

**Problema**: Indica posible falta de normalización o diseño deficiente.

**Recomendación**: 
- Considera valores por defecto para algunos campos
- Divide la tabla en múltiples tablas relacionadas
```dbml
Table customers {
  id integer [pk, increment]
  name varchar(100) [not null]
  email varchar(100) [not null]
}

Table customer_addresses {
  id integer [pk, increment]
  customer_id integer [not null]
  address varchar(200)
  city varchar(50)
  state varchar(50)
  zip_code varchar(10)
}

Ref: customer_addresses.customer_id > customers.id
```

---

#### 4. Palabras Reservadas SQL
**Descripción**: Nombres de tablas o columnas que son palabras reservadas en SQL.

**Ejemplo**:
```dbml
Table user {        // ❌ 'user' es palabra reservada
  id integer [pk]
  name varchar(100)
  order integer     // ❌ 'order' es palabra reservada
}
```

**Problema**: Puede causar errores de sintaxis o requerir comillas/backticks.

**Recomendación**:
```dbml
Table users {       // ✅ Pluralizar o renombrar
  id integer [pk]
  name varchar(100)
  order_number integer  // ✅ Nombre descriptivo
}
```

---

#### 5. Campo ID que no es Primary Key
**Descripción**: Un campo llamado "id" o "table_id" que no está marcado como clave primaria.

**Ejemplo**:
```dbml
Table products {
  product_id integer [pk, increment]  // PK real
  id varchar(50)                      // ❌ Confuso!
  name varchar(200)
}
```

**Problema**: Causa confusión sobre cuál es el identificador real.

**Recomendación**:
- Si `id` es el identificador único, márcalo como `[pk]`
- Si no lo es, renómbralo para evitar confusión (ej: `sku_code`, `product_code`)

---

#### 6. Dependencias Circulares
**Descripción**: Dos tablas que se referencian mutuamente.

**Ejemplo**:
```dbml
Table users {
  id integer [pk]
  main_post_id integer
}

Table posts {
  id integer [pk]
  user_id integer [not null]
}

Ref: users.main_post_id > posts.id
Ref: posts.user_id > users.id
```

**Problema**: Complica las operaciones de INSERT y DELETE.

**Recomendación**:
- Haz una de las referencias nullable
- Considera si realmente necesitas ambas referencias
```dbml
Table users {
  id integer [pk]
  main_post_id integer  // ✅ nullable para romper el ciclo
}
```

---

### ℹ️ Información (Severidad Baja)

#### 7. Demasiados Campos en una Tabla
**Descripción**: Tablas con más de 20 campos.

**Problema**: Puede indicar violación del principio de responsabilidad única.

**Recomendación**: Dividir en tablas más pequeñas y relacionadas.

---

#### 8. Convenciones de Nomenclatura
**Descripción**: Nombres que no siguen estándares comunes.

**Problemas**:
- Nombres que empiezan con números
- Espacios o caracteres especiales
- Caracteres no-ASCII

**Recomendación**: 
```dbml
// ❌ Malo
Table 1_users { }
Table user-profile { }

// ✅ Bueno
Table users { }
Table user_profiles { }
```

---

#### 9. Claves Foráneas sin Índice
**Descripción**: Campos de clave foránea sin índice explícito.

**Ejemplo**:
```dbml
Table order_items {
  id integer [pk, increment]
  order_id integer [not null]  // FK sin índice
  product_id integer [not null]  // FK sin índice
  quantity integer
}

Ref: order_items.order_id > orders.id
Ref: order_items.product_id > products.id
```

**Problema**: Las consultas JOIN pueden ser lentas.

**Recomendación**: Agregar índices si estos campos se usan frecuentemente en JOINs:
```dbml
Table order_items {
  id integer [pk, increment]
  order_id integer [not null]
  product_id integer [not null]
  quantity integer
  
  indexes {
    order_id
    product_id
  }
}
```

---

#### 10. Tablas de Unión (Junction Tables)
**Descripción**: Detección informativa de tablas que parecen ser para relaciones muchos-a-muchos.

**Ejemplo**:
```dbml
Table student_courses {
  student_id integer [pk]
  course_id integer [pk]
  enrollment_date timestamp
}

Ref: student_courses.student_id > students.id
Ref: student_courses.course_id > courses.id
```

**Información**: El sistema detectó esta tabla como de unión.

**Recomendación**: Verifica que tenga las restricciones e índices apropiados.

---

## 📊 Formato del Reporte

El reporte generado incluye:

```
📊 Reporte de Anti-Patrones

Total de problemas detectados: 15
- Errores: 2
- Advertencias: 8
- Información: 5

❌ ERRORES:
1. Tabla "empty_table" está vacía
   Esta tabla no tiene campos definidos.
   💡 Define al menos una columna para esta tabla o elimínala si no es necesaria.

⚠️ ADVERTENCIAS:
1. Tabla "users" sin clave primaria
   Esta tabla no tiene una clave primaria definida...
   💡 Agrega una clave primaria (PK) a esta tabla...

ℹ️ INFORMACIÓN:
1. Campo FK "order_id" en tabla "order_items" podría necesitar un índice
   Las claves foráneas se benefician de índices...
   💡 Considera agregar un índice a este campo...
```

---

## 💡 Mejores Prácticas

### ✅ Siempre Incluir:
1. **Clave primaria** en cada tabla
2. **NOT NULL** para campos obligatorios
3. **Valores por defecto** cuando sea apropiado
4. **Índices** en claves foráneas de uso frecuente

### ✅ Evitar:
1. Tablas sin PK
2. Más del 50% de campos nullable
3. Palabras reservadas SQL
4. Más de 20 campos en una tabla
5. Dependencias circulares sin campos nullable

### ✅ Considerar:
1. Normalización apropiada (3NF generalmente)
2. Nombres descriptivos y consistentes
3. Documentación con Notes
4. Constraints apropiados (UNIQUE, CHECK, etc.)

---

## 🔧 Extensión y Personalización

Si necesitas configurar o extender las reglas de detección, puedes:

1. Ver el código fuente en `src/antiPatternDetector.ts`
2. Ajustar umbrales (ej: porcentaje de campos NULL)
3. Agregar nuevas reglas de detección
4. Modificar mensajes y recomendaciones

---

## 📝 Ejemplo Completo

Para ver todos los anti-patrones en acción, abre el archivo:
`examples/anti-patterns-demo.dbml`

Este archivo incluye ejemplos de cada tipo de anti-patrón detectado.

---

## 🤝 Contribuir

¿Tienes ideas para nuevos anti-patrones a detectar? 
¡Las contribuciones son bienvenidas!

Algunos anti-patrones que podrían agregarse en el futuro:
- Detección de campos de tipo TEXT sin límite
- Tablas de auditoría sin índices en timestamp
- Campos booleanos representados como enteros
- Campos de fecha sin zona horaria
- Y más...
