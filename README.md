# PBL系统代码结构概述

如果您对下述任意部分的结构与实现有所疑问，请在GitHub repo中提issue。

## 后端常驻服务

后端常驻服务源码：

- https://github.com/garlic0708/pbl-notification-service
- https://github.com/garlic0708/pbl-mashup
- https://github.com/garlic0708/pbl-task-service
- https://github.com/garlic0708/pbl-user-project-service
- https://github.com/garlic0708/pbl-resource-service

后端的公共部分：

- https://github.com/garlic0708/pbl-lib

常驻服务均使用node.js实现。各服务均被设计为k8s集群中的[service](https://kubernetes.io/docs/concepts/services-networking/service/)（通过k8s内置的DNS系统进行服务发现），但目前仅user-project服务对k8s部署进行了相关配置。

除此之外，各服务均可使用`npm start`在本地启动，在package.json的声明中包含了各服务在本地启动时所使用的端口。在本地启动时，各服务启动的顺序应符合服务间相互依赖的顺序。

`npm run build && npm run prod`可在生产环境下启动服务。生产环境和本地环境的区别可参见package.json内的声明。

各服务均依赖于MongoDB及Redis服务。在本地启动服务时，应先行在本地的27017和6379端口分别启动MongoDB及Redis服务。其配置方法可参考官方文档。在生产环境下，上述两服务亦将通过k8s DNS予以实现。

各服务均依赖于pbl-lib包。目前在各服务的package.json中均是以文件相对路径的方式引用该包。在该包中，指定了不同环境下（本地/生产环境）各服务之间进行服务发现的方式（本地直接通过端口访问，生产环境下通过k8s DNS进行服务发现）。目前各服务和lib之间的组织方式、及不同环境下各服务配置的方式，可能并不利于服务的长期维护，因此可能是一个待重构优化的方向。

后端各常驻服务均对外提供graphql服务。各服务内的代码组织结构较为简单：

- index.js为服务运行入口；
- graphql.js为该服务所提供的GraphQL Schema及各字段的resolver；
- dal目录下为与MongoDB的交互逻辑；
- connection目录下为MongoDB及Redis连接的初始化逻辑。

目前各服务的逻辑都较为简单，因此并未设计单独的逻辑层，直接由接口层（graphql.js）与数据层（dal）进行交互。

各服务均使用了[Apollo Server](https://www.apollographql.com/docs/apollo-server/)作为graphql服务的实现框架。目前各服务间相互调用的方式均为[Schema stitching](https://www.apollographql.com/docs/graphql-tools/schema-stitching/)，但在本文档写作时该功能已被标注为废弃；在开发过程中也证明这一方式并不适用于服务间的相互调用。因此可能需要参考Apollo提供的新的组合模式：[Federation](https://www.apollographql.com/docs/apollo-server/federation/migrating-from-stitching/)，或通过其他方式进行服务间的相互调用。

在各服务的最上游一端是pbl-mashup服务，其逻辑是简单地将其他服务所提供的graphql schema进行schema stitching。在本服务的入口执行了基于[JWT](https://jwt.io/)的访问控制。**如果您参考了下节的建议，不考虑原本以AWS Lambda实现的、过于复杂的访问控制功能，亦可套用一个简单的基于JWT的访问控制系统。**

## AWS Lambda函数

后端AWS lambda源码：

- https://github.com/garlic0708/pbl-pj-access-control-layer

**本项目在设计过程中考虑了过多的扩展点，主要是针对第三方程序，导致在访问控制方面的逻辑过于复杂，可维护性较差。在对本项目进行重构时，可直接抛弃原项目所设计的对第三方程序的支持：仅基于上述的后端常驻服务，进行功能扩展和结构逻辑优化；而无需考虑AWS Lambda的部分。**

本项目后端设计了一个AWS Lambda函数，主要用于各项访问控制的通用功能。在serverless.yml中描述了其向AWS Lambda进行部署的相关配置，可参考[Serverless框架](https://serverless.com/)的相关文档。

该Lambda函数所提供的触发器主要有：

- API Gateway的HTTP API（用于第三方程序的注册及信息维护）；
- API Gateway的WebSocket API（用于与客户端维持会话）；
- API Gateway WebSocket API建立连接时的访问控制；
- Cognito执行OpenID Connect授权的相关质询流程。

所有触发器都指向这一个Lambda函数；而该函数在delegator.js中对函数出发事件的来源进行区分，并将其转送至logic目录下的相关逻辑中。

## 前端

前端源码：

- https://github.com/garlic0708/pbl-main-frontend

前端通过Angular框架实现。

本项目在设计时考虑允许第三方程序的接入，因此前端分为主界面（第三方程序运行的容器）和3个已实现的示例第三方程序（甘特图、资源管理和成员管理）。它们以[Angular application（打开链接需要科学上网）](https://medium.com/disney-streaming/combining-multiple-angular-applications-into-a-single-one-e87d530d6527)的形式进行组织：在src目录下为主界面，projects/pbl-{gantt|members|resource}为3个第三方程序。在package.json中，`start`命令用于启动主界面；`gantt`、`resource`、`members`3个命令用于启动第三方程序。

在主界面中放置了一个[iframe](https://www.w3schools.com/tags/tag_iframe.asp)元素用以作为第三方程序的容器。

projects/pbl-lib目录下是主界面和各第三方程序均依赖的公共部分。该部分通过Angular依赖注入的方式实现了获取JWT令牌、建立WebSocket连接等通用功能。**如果您参考了上节的建议，对原项目的第三方程序不再予以支持，可在此套用一个简单的获取JWT令牌的系统，并直接同后端常驻服务中的pbl-mashup进行交互；并可直接将各第三方程序合并为一，替换掉原有的iframe。**