declare const window: any
import { ServerScopedConverted } from '../@Types/snDocsSite/serverScopedConverted'
import { ServerScopedCall } from '../@Types/snDocsSite/serverScopedCall';
import TurndownService = require('turndown');


export class SNDocData {

    returnTypesNotMapped: { identifier: string, original_type: string }[] = [];
    paramTypesNotMapped: {methodIdentifier: string, paramName: string, original_type: string}[] = [];

    constructor() {

    }

    async getScopedServerDocData(releaseName: string): Promise<ServerScopedConverted.ServerNamespaceItem[]> {

        let nameSpacesRequest = {
            action: "api.navlist",
            data: {
                navbar: "server",
                release: releaseName
            }
        };

        const nameSpaceDocs = await this.getSNDevPortalData<ServerScopedCall.NavData>(nameSpacesRequest).catch((e: any) => { throw e }); //await fetch(url, {headers: headers}).then((resp) => resp.json())
        console.log('nameSpaceDocs Response: ', nameSpaceDocs);

        if (!nameSpaceDocs || !nameSpaceDocs.server || nameSpaceDocs.server.length == 0) {
            throw new Error("Did not retrieve any server Docs!");
        }

        const convertedNameSpaces = nameSpaceDocs.server.map(async (nameSpaceItem) => {
            let newNameSpaceItem: ServerScopedConverted.ServerNamespaceItem = {
                identifier: nameSpaceItem.dc_identifier,
                namespace: nameSpaceItem.dc_identifier == "no-namespace" ? "" : nameSpaceItem.name,
                classes: []
            }

            const tdService = new TurndownService();


            if (nameSpaceItem.items && nameSpaceItem.items.length > 0) {

                var newServerItemClasses = nameSpaceItem.items.map(async (classItem) => {

                    let newClassItem: ServerScopedConverted.ServerClassItem = {
                        description: "",
                        short_description: "",
                        identifier: classItem.dc_identifier,
                        name: this.fixClassName(classItem.dc_identifier, classItem.name),
                        constName: this.getConstName(classItem.dc_identifier),
                        extensionName: this.getExtensionKey(classItem.dc_identifier),
                        constructor: undefined,
                        methods: [],
                        properties: [],
                        extras: []
                    }

                    let classSpecificData = {
                        action: "api.docs",
                        data: {
                            id: newClassItem.identifier,
                            release: releaseName
                        }
                    }

                    let classDataFromServer = await this.getSNDevPortalData<ServerScopedCall.SNClassResponse>(classSpecificData);

                    if (classDataFromServer && classDataFromServer.result && classDataFromServer.result.data) {
                        let classData: ServerScopedCall.SNClassDataDetail = classDataFromServer.result.data.class_data;

                        newClassItem.short_description = tdService.turndown(classData.text || "");
                        newClassItem.description = tdService.turndown(classData.text2 || "");

                        if (classData.children && classData.children.length > 0) {

                            //first find the constructor, and tear it out of the children... then map the remaining into methods..
                            const classChildren = classData.children;

                            classChildren.forEach((methodItem) => {

                                var propertyType = methodItem.type;

                                var newMethodItem: ServerScopedConverted.ServerMethodItem = {
                                    identifier: methodItem.dc_identifier,
                                    short_description: tdService.turndown(methodItem.text || ""),
                                    description: tdService.turndown(methodItem.text2 || ""),
                                    name: methodItem.name,
                                    type: methodItem.type,
                                    examples: [],
                                    params: [],
                                    return: {
                                        type: "",
                                        description: ""
                                    },
                                    extras: []
                                };

                                const methodDetails = methodItem.children;

                                //process children items, example, params, return value, etc..
                                if (methodDetails && methodDetails.length > 0) {
                                    methodItem.children.forEach((methodDetail) => {
                                        var type = methodDetail.type


                                        if (type == 'Example') {
                                            var exampleData: ServerScopedConverted.ServerMethodExampleItem = {
                                                order: methodDetail.order,
                                                script: tdService.turndown(methodDetail.text || ""),
                                                description: tdService.turndown(methodDetail.text2 || "")
                                            }

                                            newMethodItem.examples.push(exampleData);

                                        } else if (type == "Return") {
                                            newMethodItem.return.type = this.convertReturnSNTypesToTSTypes(methodItem.dc_identifier, methodDetail.name);
                                            newMethodItem.return.description = tdService.turndown(methodDetail.text || "");

                                        } else if (type == "Parameter") {
                                            var paramData: ServerScopedConverted.ServerMethodParamItem = {
                                                order: methodDetail.order,
                                                name: methodDetail.name,
                                                type: methodDetail.text || "",
                                                description: tdService.turndown(methodDetail.text2 || "")
                                            }

                                            newMethodItem.params.push(paramData);

                                        } else {
                                            //just push into extras to sort out later..
                                            newMethodItem.extras.push(methodDetail);
                                        }

                                    });
                                }

                                if (propertyType == "Property") {
                                    newClassItem.properties.push(newMethodItem);
                                } else if (propertyType == "Constructor") {
                                    newClassItem.constructor = newMethodItem;
                                } else if (propertyType == "Method") {
                                    newClassItem.methods.push(newMethodItem);
                                } else {
                                    newClassItem.extras.push(newMethodItem);
                                }
                            })
                        }
                    }

                    return newClassItem;

                })
                console.log('promise alling!')
                var promResult = await Promise.all(newServerItemClasses);
                newNameSpaceItem.classes = promResult;
                console.log('done promise.alling!', promResult)
            }

            return newNameSpaceItem;

        });

        var finalData: any = await Promise.all(convertedNameSpaces);
        //console.log(`${releaseName}: `, JSON.stringify(finalData, null, 4));

        return finalData;

    }



    async getActiveVersions(): Promise<string[]> {
        const releaseURL = `/api/snc/v1/dev/releaseInfo?sysparm_data={"action":"release.versions","data":{}}`;

        return fetch(releaseURL).then((resp) => resp.json()).then(data => data.result.data.version_selector.active_versions).catch(e => { throw e });
    }

    getDefaultHeaders(): Headers {
        const heads = new Headers();
        heads.set("accept", "application/json");
        heads.set("x-usertoken", window.g_ck);

        return heads;
    }

    getSNDevPortalData<T>(data: any): Promise<T> {

        let res: Promise<T>;
        const urlParams = new URLSearchParams();
        urlParams.set('sysparm_data', JSON.stringify(data));
        const uri = `/devportal.do?${urlParams.toString()}`
        res = fetch(uri, { headers: this.getDefaultHeaders() }).then(resp => resp.json()).then((data) => data);

        return res;


    }

    /**
     * 
     * @param identifier 
     */
    getConstName(identifier: string) {
        //this will be a simple map of "identifier" to get if there is a "const" that should be declared for it

        const map: { identifier: string, constName: string }[] = require("./snDocDataMaps/getConstNameMap.json");

        var mapItem = map.find(ident => identifier == ident.identifier);
        if (mapItem) {
            return mapItem.constName;
        }
        return undefined;
    }

    /**
     * 
     * @param identifer The dc_identifier of the class to convert to a "proper name"
     */
    fixClassName(identifer: string, className: string) {


        const map: { identifer: string, className: string }[] = require('./snDocDataMaps/fixClassNameMap.json');

        var res;

        var mapItem = map.find(ident => identifer == ident.identifer);
        if (mapItem) {
            res = mapItem.className;
        }

        if (!mapItem) {
            //if we didn't find it in the map, we likely just need to do some standard fixing cause SN likes to be weird... 
            let fixedClassName = className;
            fixedClassName = fixedClassName.replace(' - Scoped, Global', '');
            fixedClassName = fixedClassName.replace(' API', ''); //yea they love throwing "api" on the names..

            res = fixedClassName;
        }

        //finally if still no res... set it to incoming class name

        if (!res) {
            res = className;
        }

        return res;

    }

    getExtensionKey(identifer: string) {

        const map: { identifier: string, extensionName: string }[] = require('./snDocDataMaps/getExtensionKeyMap.json');

        var mapItem = map.find(ident => identifer == ident.identifier);
        if (mapItem) {
            return mapItem.extensionName;
        }

        return undefined;
    }

    /**
     * Handle SN's goofy param types where they randomly decide to through HTML in there?
     * @param identifier 
     */
    handleClassPropertyTSTypes(identifier: string) {

        //propertyTypes 

        const map: { identifier: string, type: string }[] = require('./snDocDataMaps/handleClassPropertyTSTypes.json');
    }

    convertReturnSNTypesToTSTypes(identifier: string, type: string) {
        
        //handle some generic cleanup that always seems to be a problem and makes any additional checking a real pain
        type = type.replace('Scoped ', ''); //they throw this on cause global scope copies that are different exist... but for us we clear..
        type = type.replace(' object', '');

        var res = type || '';
        var typeNotTranslated = false;
        var typeWasInMap = false

        //look in map by identifier (meaning we have an explicit replacement). This can be useful when we want to fix SN's weird ones like "array.name" and "array.sys_id" when it's an array of "Defined objects"
        if (identifier) {
            const map: { identifier: string, type: string }[] = require('./snDocDataMaps/snMethodReturnTypesToTSTypes.json');

            let mappedItem = map.find((item) => item.identifier == identifier);
            if (mappedItem) {
                res = mappedItem.type;
                typeWasInMap = true;
            } else if (identifier.indexOf('GQ_') == 0 || identifier.indexOf('Stream-chunk_N') > -1) {
                res = 'any'; //<--- GlideQuery... a ScriptInclude made it to docs site... It looks like a mess, so it can return "any" type..
                typeWasInMap = true; //hand coded map to cover multiple, but it counds for logic purposes.
            }
        }

        var validType = this.checkValidTypes(type);
        var parsedGenericType = this.parseSNGenerics(type);

        //cleanup SN's generic types..
        if (res) {
            if(validType){
                res = type; //already valid! woo!
            } else if (parsedGenericType){
                res = parsedGenericType;
            }  else {
                if (!typeWasInMap) {
                    typeNotTranslated = true;
                    res = 'any'; //default to "any" as this will sovel majority of issues we will see crap up.
                    this.returnTypesNotMapped.push({ identifier: identifier, original_type: type });
                }
            }
        }

        return res;

    }

    convertSNParamTypesToTSTypes(methodIdentifier: string, paramName:string, type: string){
        let res = undefined;

        const map:{identifier: string, paramName: string, type: string}[] = require('./snDocDataMaps/snParamTypesToTSTypes.json');

        let typeWasInMap = false;
        let typeNotTranslated = false;

        let mappedItem = map.find((item) => item.identifier == methodIdentifier && item.paramName == paramName);

        if(mappedItem){
            res = mappedItem.type;
            typeWasInMap = true;
        }

        let validType = this.checkValidTypes(type);
        let parsedGeneric = this.parseSNGenerics(type);

        if(validType){
            res = type;
        } else if(parsedGeneric){
            res = parsedGeneric;
        } else {
            if (!typeWasInMap) {
                typeNotTranslated = true;
                res = 'any'; //default to "any" as this will sovel majority of issues we will see crap up.
                this.paramTypesNotMapped.push({ methodIdentifier: methodIdentifier, paramName: paramName, original_type: type });
            }
        }
    }

    checkValidTypes(type:string):boolean {
        let res = false;

        var validSNTypes:string[] = require('./snDocDataMaps/validSNTypes.json');
        if(validSNTypes.includes(type)){
            res = true;
        }

        return res;
    }

    /**
     * This function is intended to coerce any of ServiceNows "Generic" types to proper JavaScript (JSDoc) / Typescript types. 
     * Or at the very least, perform some cleanup so the Typescript definitions won't explode... like "String or Object" vs "string | {}"
     * If parsed type not found, undefined is returned.
     * @param type The SN Type from docs portal
     */
    parseSNGenerics(type: string): string | undefined{

        var res = undefined

        var stringTypes = ["sys_id", "String", "Strings", "strings", "StringMap", "String or Number"];
        var voidTypes =["void", "none", "None"];
        var numberTypes = ["Number", "Number (Long)", "integer", "Integer", "int", "decimal", "Decimal", "number"];
        var booleanTypes = ["Boolean"];
        var anyArrayTypes = ["array", "List", "ArrayList"];
        var anyOrUndefinedTypes = ["optional","Optional","Optional API", "OptionalAPI"];
        var anyTypes = ["Any"]
        var nameValueTypes =["MapString", "JSON", "JSON key/value pairs", "Map"];
        
        
        if(stringTypes.includes(type)) {
            res = 'string';
        } else if (voidTypes.includes(type)) {
            res = 'void';
        } else if (numberTypes.includes(type)) {
            res = 'number';
        } else if (booleanTypes.includes(type)) {
            res = 'boolean';
        } else if (anyArrayTypes.includes(type)) {
            res = 'any[]';
        } else if (anyOrUndefinedTypes.includes(type)) {
            res = 'any | undefined';
        } else if (anyTypes.includes(type)) {
            res = 'any';
        } else if (nameValueTypes.includes(type) || (type.toLowerCase().indexOf('object') && type.indexOf('.') == -1)) {
            //The IndexOf and lowercase check are looking for "object" declreations that is not SN detailing out the object properties since we want those to still be reported as this time
            //so whenever I get around to caring about those classes I can fix their maps.
            res = '{[fieldName: string]: string}'; //this is really an "object" but a generic object?
        }

        return res;
    }

    getReturnTypesNotMapped() {
        return this.returnTypesNotMapped;
    }
}

