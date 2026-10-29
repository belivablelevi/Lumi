# Native parts of Lumi Studio:
#   lumicore      shared library (Lumi's real face engine, genes, packs) for the app
#   virtual_lumi  a pretend unit on a serial port, for trying provisioning without hardware
#
#   cmake -S tools/studio -B build/studio && cmake --build build/studio --config Release
cmake_minimum_required(VERSION 3.16)
project(lumi_studio_native CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)

set(CORE ${CMAKE_CURRENT_SOURCE_DIR}/../../firmware/lib/lumi_core/src)
file(GLOB CORE_SOURCES ${CORE}/*.cpp)

add_library(lumicore SHARED native/lumi_capi.cpp ${CORE_SOURCES})
target_include_directories(lumicore PRIVATE ${CORE})
if(MSVC)
  target_compile_options(lumicore PRIVATE /W3)
else()
  target_compile_options(lumicore PRIVATE -Wall -Wextra)
endif()

if(UNIX)
  add_executable(virtual_lumi native/virtual_lumi.cpp ${CORE_SOURCES})
  target_include_directories(virtual_lumi PRIVATE ${CORE} ${CMAKE_CURRENT_SOURCE_DIR}/../sim)
  target_compile_options(virtual_lumi PRIVATE -Wall -Wextra)
endif()
