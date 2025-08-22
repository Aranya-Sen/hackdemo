const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize) => {
  const Coordinator = sequelize.define('Coordinator', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 100]
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [6, 255]
      }
    },
    department: {
      type: DataTypes.ENUM,
      values: [
        'Computer Science', 'Electronics', 'Mechanical', 'Civil', 
        'Electrical', 'Chemical', 'Information Technology', 
        'Biotechnology', 'Administration', 'Library', 'Maintenance'
      ],
      allowNull: false
    },
    employeeId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    phone: {
      type: DataTypes.STRING,
      validate: {
        is: /^[0-9]{10}$/
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    lastLogin: {
      type: DataTypes.DATE
    }
  }, {
    hooks: {
      beforeCreate: async (coordinator) => {
        if (coordinator.password) {
          coordinator.password = await bcrypt.hash(coordinator.password, 12);
        }
      },
      beforeUpdate: async (coordinator) => {
        if (coordinator.changed('password')) {
          coordinator.password = await bcrypt.hash(coordinator.password, 12);
        }
      }
    },
    timestamps: true
  });

  // Instance method to check password
  Coordinator.prototype.validatePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
  };

  // Instance method to get public data (excluding password)
  Coordinator.prototype.getPublicData = function() {
    const { password, ...publicData } = this.toJSON();
    return publicData;
  };

  return Coordinator;
};