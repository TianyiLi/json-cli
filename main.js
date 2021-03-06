#!/usr/bin/env node
const get = require('lodash/get')
const set = require('lodash/set')
const table = require('cli-table2')
const meow = require('meow')
const fs = require('fs')
const inquirer = require('inquirer')
const JSON5 = require('json5')
const fuzzy = require('fuzzy')

let JSON_Object = {}
let noChange = true
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'))

function getPairs (child = {}, parents = '') {
  if (child instanceof Array) {
    return child.reduce((prev, ele, index) => {
      return Object.assign(prev, getPairs(ele, `${parents}[${index}]`))
    }, {})
  } else if (typeof child !== 'object') {
    return { [`${parents}`]: child }
  } else {
    return Object.entries(child).reduce((prev, [key, obj]) => {
      return Object.assign(
        prev,
        getPairs(obj, `${parents !== '' ? parents + '.' : parents}${key}`)
      )
    }, {})
  }
}

async function main () {
  const cli = meow(`
  Usage
    $ i18n-shell <input-file>
  Options
    --write-file, -w assign the copy target files
  Examples
    $ i18n-shell ./test.json -w ./test2.json
  `, {
      flags: {
        writeFile: {
          type: 'string',
          alias: 'w',
          default: false
        }
      }
    })
  if (!cli.input[0] || !fs.lstatSync(cli.input[0]).isFile() || !/\.json(5?)$/.test(cli.input[0])) {
    console.error(`Input file is not correct.`)
    process.exit(1)
  }
  const outputFiles = cli.flags.w || cli.flags.writeFile || cli.input[0]
  const file = fs.readFileSync(cli.input[0], { encoding: 'utf8' })

  JSON_Object = JSON5.parse(file)
  const list = getPairs(JSON_Object)
  const autoCompleteList = Object.entries(list).map(ele => ele[0])
  let looping = true
  do {
    /** @type {{path: string}} */
    const { path } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'path',
        message: 'The object you want to modified',
        async source (answer, input = '') {
          let result = fuzzy.filter(input, autoCompleteList).map(ele => ele.original)
          if (!~result.indexOf(input)) {
            return result.concat([input])
          } else {
            return result
          }
        }
      }
    ])
    let obj = get(list, path)
    const typeOfObject = typeof obj
    if (obj) {
      console.log(`
  From ${path} get the message as below:
    ${get(list, path)}
      `)
    } else {
      const { create } = await inquirer.prompt({
        type: 'confirm',
        name: 'create',
        message: 'Didn\'t find the matching object on this path, create a new one?',
        default: true
      })
      if (!create) continue
      set(list, path, null)
    }
    let { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: 'Modified to: ',
        default () {
          return get(list, path) || 'null'
        }
      }
    ])
    const _t = new table()
    _t.push({
      'Pre': [get(list, path)]
    }, {
        'Would be modified to ': [value]
      })
    console.log(_t.toString())
    const { change } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'change',
        message: 'Confirm to change?',
        default: true
      }
    ])
    if (change) {
      switch (typeOfObject) {
        case 'boolean':
          value = !~['true', 'false'].indexOf(value) ? value === 'true' : value;
          break
        case 'number':
          value = /\d+/.test(value) ? +value : value
          break
      }
      if (value === 'undefined') {
        const { confirmToUndefined } = await inquirer.prompt({
          type: 'confirm',
          name: 'confirmToUndefined',
          default: true,
          message: 'Value is set to undefined, you want to delete it?'
        })
        if (confirmToUndefined) {
          let params = path.match(/(.*)(\.\w+|\[\d+\])$/)
          if (params === null) {
            delete JSON_Object[path]
          } else {
            const obj = get(JSON_Object, params[1])
            if (Array.isArray(obj)) {
              let index = +(params[2].substring(1, params[2].length - 1))
              obj.splice(index, 1)
            } else {
              delete obj[params[2].substr(1)]
            }
          }
        } else {
          set(JSON_Object, path, value)
        }
      }else {
        set(JSON_Object, path, value)
        list[path] = value
        console.log(`The value is changed`)
      }
      noChange = false
    }
    const { repeat } = await inquirer.prompt({
      type: 'confirm',
      name: 'repeat',
      message: 'Need to modified others?',
      default: false
    })
    looping = repeat
  } while (looping)
  if (!noChange) {
    fs.writeFileSync(outputFiles, JSON.stringify(JSON_Object, null, 4), { encoding: 'utf8' })
    console.log(`Generate Done`)
  } else {
    console.log('File No Change')
  }
}

main()